"""P&L reconciliation engine.

Replicates the Excel workbook formulas exactly. See workbook 'final output' sheet.
"""
from __future__ import annotations
from typing import Any
import pandas as pd
from parsers import col, _num, parse_date_any


def is_valid_order(order_row: dict) -> bool:
    """Excel: IF(AND(E<>"Cancelled", O>0, G<>"Non-Amazon"), "Valid","Excluded")"""
    status = str(col(order_row, "order-status")).strip()
    qty = _num(col(order_row, "quantity"))
    channel = str(col(order_row, "sales-channel")).strip()
    return status.lower() != "cancelled" and qty > 0 and channel.lower() != "non-amazon"


def build_rows(orders: list[dict], payment: list[dict], fba_returns: list[dict],
               easyship_returns: list[dict], cost_prices: dict[str, float]) -> list[dict]:
    """Build the per-order rows exactly like 'final output' rows 2..N."""

    # Index payment by order id → sum of 'total' column (col AA)
    payment_by_order: dict[str, float] = {}
    for p in payment:
        oid = str(col(p, "order id")).strip()
        if not oid:
            continue
        payment_by_order[oid] = payment_by_order.get(oid, 0.0) + _num(col(p, "total"))

    # Index FBA returns by order id
    fba_ret_by_order: dict[str, dict] = {}
    for r in fba_returns:
        oid = str(col(r, "order-id")).strip()
        if oid and oid not in fba_ret_by_order:
            fba_ret_by_order[oid] = r

    # Index Easy-Ship returns by order id
    es_ret_by_order: dict[str, dict] = {}
    for r in easyship_returns:
        oid = str(col(r, "Order ID", "order id")).strip()
        if oid and oid not in es_ret_by_order:
            es_ret_by_order[oid] = r

    rows_out: list[dict] = []
    for o in orders:
        if not is_valid_order(o):
            continue
        oid = str(col(o, "amazon-order-id")).strip()
        sku = str(col(o, "sku")).strip()
        qty = _num(col(o, "quantity"))
        item_price = _num(col(o, "item-price"))
        payment_amt = float(payment_by_order.get(oid, 0.0))

        fba_r = fba_ret_by_order.get(oid)
        es_r = es_ret_by_order.get(oid)
        return_reason = ""
        product_condition = ""
        if fba_r:
            return_reason = str(col(fba_r, "reason")).strip()
            product_condition = str(col(fba_r, "detailed-disposition")).strip()
        elif es_r:
            return_reason = str(col(es_r, "return reason", "Return reason")).strip()

        default_unit_cost = float(cost_prices.get(sku, 0.0)) if sku in cost_prices else None

        rows_out.append({
            "order_id": oid,
            "sku": sku,
            "product_name": str(col(o, "product-name")).strip(),
            "quantity": qty,
            "item_price": item_price,
            "payment": payment_amt,
            "cost_price_unit": default_unit_cost,   # None if unknown SKU
            "cost_price_unit_override": None,        # user can override for sellable returns
            "return_reason": return_reason,
            "product_condition": product_condition,
            "order_status": str(col(o, "order-status")).strip(),
            "is_return": bool(return_reason or product_condition),
        })
    return rows_out


def unique_skus_needing_cost(rows: list[dict]) -> list[dict]:
    """Return distinct SKUs with product_name and whether cost is missing."""
    seen: dict[str, dict] = {}
    for r in rows:
        s = r["sku"]
        if not s:
            continue
        if s not in seen:
            seen[s] = {"sku": s, "product_name": r["product_name"], "count": 0, "has_cost": r["cost_price_unit"] is not None}
        seen[s]["count"] += 1
    return sorted(seen.values(), key=lambda x: (x["has_cost"], x["sku"]))


def compute_summary(rows: list[dict], payment: list[dict], fba_removal: list[dict],
                    ad_spend: list[dict], target_month: int, target_year: int) -> dict[str, Any]:
    """Replicate the summary formulas from the Excel workbook."""

    # Effective unit cost = override if set, else default
    def eff_cost(r):
        if r.get("cost_price_unit_override") is not None:
            return float(r["cost_price_unit_override"])
        return float(r.get("cost_price_unit") or 0.0)

    total_item_price = sum(r["item_price"] for r in rows)                        # D66
    total_payment    = sum(r["payment"] for r in rows)                           # E66 = Settlement
    total_cogs       = sum(r["quantity"] * eff_cost(r) for r in rows)            # G66 = COGS
    orders_count     = sum(1 for r in rows if r["payment"] != 0)
    returns_count    = sum(1 for r in rows if r["is_return"] and r["payment"] != 0)

    # Payment raw filtered by date range using best-effort date column detection
    _DATE_COLS = (
        "Transaction Release Date",
        "date/time",
        "posted-date",
        "posted date",
        "settlement-start-date",
        "transaction release date",
    )
    def _txn_date(p):
        d = parse_date_any(col(p, *_DATE_COLS))
        if d is None:
            return None
        if d.tz is None:
            d = d.tz_localize("UTC")
        return d

    def payment_in_month(month: int, year: int) -> list[dict]:
        out = []
        start = pd.Timestamp(year=year, month=month, day=1, tz="UTC")
        # next month first day
        if month == 12:
            end = pd.Timestamp(year=year + 1, month=1, day=1, tz="UTC")
        else:
            end = pd.Timestamp(year=year, month=month + 1, day=1, tz="UTC")
        for p in payment:
            d = _txn_date(p)
            if d is None:
                continue
            if start <= d < end:
                out.append(p)
        return out

    month_txns = payment_in_month(target_month, target_year)
    next_month = target_month + 1 if target_month < 12 else 1
    next_year  = target_year if target_month < 12 else target_year + 1
    next_month_txns = payment_in_month(next_month, next_year)

    def sum_by_desc(txns, keyword: str) -> float:
        total = 0.0
        kw = keyword.lower()
        for p in txns:
            desc = str(col(p, "description")).lower()
            if kw in desc:
                total += _num(col(p, "total"))
        return total

    # Also update the orphan-reimbursement date lookup to use the broader helper
    valid_ids = {r["order_id"] for r in rows if r.get("order_id")}
    orphan_reimbursements = []
    orphan_total = 0.0
    for p in month_txns:
        desc = str(col(p, "description"))
        if "reimbursement" not in desc.lower():
            continue
        oid = str(col(p, "order id")).strip()
        if not oid:
            continue
        if oid in valid_ids:
            continue
        amt = _num(col(p, "total"))
        orphan_total += amt
        orphan_reimbursements.append({
            "order_id": oid,
            "description": desc,
            "amount": round(amt, 2),
            "date": str(col(p, *_DATE_COLS)),
        })

    reimbursement = sum_by_desc(month_txns, "reimbursement")

    # Inbound fee: any Payment line whose description contains "inbound" (covers
    # 'FBA Inbound Pickup Service', 'FBA Inbound Transportation Fee', 'Inbound
    # Placement Service' etc.) AND whose date falls in the target month itself.
    # Amazon stores these as negative totals; flip the sign to make it a positive expense.
    inbound_total = 0.0
    inbound_matches = 0
    for p in month_txns:
        desc = str(col(p, "description")).lower()
        if "inbound" not in desc:
            continue
        inbound_matches += 1
        inbound_total += _num(col(p, "total"))
    inbound_fee = -inbound_total

    # Storage fee: Amazon posts this on the 7th of the month AFTER the target month.
    # Match ANY payment line whose description contains "storage" and is dated after the
    # target month ends. This is more robust than requiring the txn to fall exactly in
    # the next calendar month (users' Payment export sometimes crosses week boundaries).
    if target_month == 12:
        target_end = pd.Timestamp(year=target_year + 1, month=1, day=1, tz="UTC")
    else:
        target_end = pd.Timestamp(year=target_year, month=target_month + 1, day=1, tz="UTC")

    storage_matches_after = []
    storage_matches_all = []
    for p in payment:
        desc = str(col(p, "description")).lower()
        if "storage" not in desc:
            continue
        storage_matches_all.append(p)
        d = _txn_date(p)
        if d is not None and d >= target_end:
            storage_matches_after.append(p)
    # Prefer post-target storage lines; fall back to any storage line if dates are missing.
    chosen_storage = storage_matches_after if storage_matches_after else storage_matches_all
    storage_fee = -sum(_num(col(p, "total")) for p in chosen_storage)

    # Removal fee: computed from the Payment report itself — any row whose description
    # contains "removal order" (case-insensitive) AND whose date is inside the target month.
    # Amazon stores these as negative totals; flip sign to positive expense.
    removal_total = 0.0
    removal_matches = 0
    for p in month_txns:
        desc = str(col(p, "description")).lower()
        if "removal order" not in desc:
            continue
        removal_matches += 1
        removal_total += _num(col(p, "total"))
    removal_fee = -removal_total

    ad_total    = sum(_num(col(a, "Spend", "spend")) for a in ad_spend)

    total_received  = total_payment + reimbursement
    total_deduction = total_cogs + inbound_fee + storage_fee + removal_fee + ad_total
    final_profit    = total_received - total_deduction

    import math
    def clean(v):
        try:
            f = float(v)
            if math.isnan(f) or math.isinf(f):
                return 0.0
            return f
        except Exception:
            return 0.0
    def safe_div(a, b):
        b = clean(b)
        if not b:
            return 0.0
        v = clean(a) / b * 100
        return 0.0 if math.isnan(v) or math.isinf(v) else v

    acos_pct        = safe_div(ad_total, total_item_price)
    profit_pct      = safe_div(final_profit, total_item_price)
    profit_on_cogs  = safe_div(final_profit, total_cogs)
    return_pct      = safe_div(returns_count, orders_count) if orders_count else 0.0

    return {
        "target_month": target_month,
        "target_year": target_year,
        "settlement": round(clean(total_payment), 2),
        "reimbursement": round(clean(reimbursement), 2),
        "total_received": round(clean(total_received), 2),
        "cogs": round(clean(total_cogs), 2),
        "inbound_fee": round(clean(inbound_fee), 2),
        "storage_fee": round(clean(storage_fee), 2),
        "removal_fee": round(clean(removal_fee), 2),
        "ad_spend": round(clean(ad_total), 2),
        "total_deduction": round(clean(total_deduction), 2),
        "final_profit": round(clean(final_profit), 2),
        "acos_pct": round(acos_pct, 2),
        "profit_pct": round(profit_pct, 2),
        "profit_pct_on_cogs": round(profit_on_cogs, 2),
        "return_pct": round(return_pct, 2),
        "total_item_price": round(clean(total_item_price), 2),
        "orders_count": int(orders_count),
        "returns_count": int(returns_count),
        "orphan_reimbursement_total": round(clean(orphan_total), 2),
        "orphan_reimbursements": orphan_reimbursements,
    }
