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


RTO_KEYWORDS = (
    "rto", "return to origin", "return-to-origin",
    "undelivered", "un-delivered", "not delivered", "non-delivered",
    "und-", "und_",         # Amazon Easy Ship code prefix e.g. UND-UNKNOWN, UND-DAMAGED
    "refused", "customer refused", "delivery refused",
    "ref-",                 # Easy Ship refusal code prefix
    "customer not available", "address not found", "wrong address",
    "no response", "not available",
)


def _classify_return(source: str, reason: str) -> str:
    """Classify a return as 'customer' or 'rto'. FBA is always customer; Easy Ship
    is customer unless the reason clearly indicates an RTO (undelivered, refused, etc.)."""
    if source == "fba":
        return "customer"
    r = (reason or "").lower()
    for kw in RTO_KEYWORDS:
        if kw in r:
            return "rto"
    return "customer"


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
        return_source = ""
        lpn = ""
        if fba_r:
            return_reason = str(col(fba_r, "reason")).strip()
            product_condition = str(col(fba_r, "detailed-disposition")).strip()
            return_source = "fba"
            lpn = str(col(fba_r, "license-plate-number", "License Plate Number", "lpn", "LPN")).strip()
        elif es_r:
            return_reason = str(col(es_r, "return reason", "Return reason")).strip()
            return_source = "easyship"

        return_kind = _classify_return(return_source, return_reason) if return_source else ""

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
            "return_source": return_source,          # fba / easyship / ""
            "return_kind": return_kind,              # customer / rto / ""
            "lpn": lpn,                              # only populated for fba returns
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
                    ad_spend: list[dict], target_month: int, target_year: int,
                    orders: list[dict] | None = None,
                    extras: dict | None = None) -> dict[str, Any]:
    """Replicate the summary formulas from the Excel workbook.

    `extras` (optional) accepts operator-entered monthly costs:
      • packing_cost_per_easyship   — ₹ per Merchant-fulfilled order (multiplied by the count)
      • total_inbound_packing_cost  — ₹ total for the month (added as-is)
      • misc_cost                   — ₹ total, added as-is; resets per-report so it never carries over
    """
    orders = orders or []
    extras = extras or {}

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
    customer_return_count = sum(1 for r in rows if r.get("return_kind") == "customer" and r["payment"] != 0)
    rto_count             = sum(1 for r in rows if r.get("return_kind") == "rto" and r["payment"] != 0)

    # Payment column aliases — Amazon renames these across marketplaces / report exports
    _DESC_HEADERS = ("description", "Description", "Transaction description", "transaction description", "type", "Type")
    _TOTAL_HEADERS = ("total", "Total", "amount", "Amount", "transaction amount")
    def _pay_desc(p) -> str:
        return str(col(p, *_DESC_HEADERS)).strip()
    def _pay_total(p) -> float:
        return _num(col(p, *_TOTAL_HEADERS))

    # Payment raw filtered by date range using best-effort date column detection.
    # We try known header names first, then fall back to scanning every column that
    # smells like a date. This makes us robust to Amazon renaming headers across
    # marketplaces / new report exports.
    _KNOWN_DATE_HEADERS = (
        "Transaction Release Date",
        "date/time",
        "posted-date",
        "posted date",
        "settlement-start-date",
        "transaction release date",
    )
    def _txn_date(p):
        # 1) known header priority
        d = parse_date_any(col(p, *_KNOWN_DATE_HEADERS))
        if d is None:
            # 2) any header containing 'date' or 'time' (case-insensitive)
            for k, v in p.items():
                if not k:
                    continue
                kl = k.strip().lower()
                if ("date" in kl or "time" in kl) and v:
                    d = parse_date_any(v)
                    if d is not None:
                        break
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
            desc = _pay_desc(p).lower()
            if kw in desc:
                total += _pay_total(p)
        return total

    # Also update the orphan-reimbursement date lookup to use the broader helper
    valid_ids = {r["order_id"] for r in rows if r.get("order_id")}
    orphan_reimbursements = []
    orphan_total = 0.0
    for p in month_txns:
        desc = _pay_desc(p)
        if "reimbursement" not in desc.lower():
            continue
        oid = str(col(p, "order id", "order-id", "Order ID", "amazon-order-id")).strip()
        if not oid:
            continue
        if oid in valid_ids:
            continue
        amt = _pay_total(p)
        orphan_total += amt
        orphan_reimbursements.append({
            "order_id": oid,
            "description": desc,
            "amount": round(amt, 2),
            "date": str(col(p, *_KNOWN_DATE_HEADERS)),
        })

    reimbursement = sum_by_desc(month_txns, "reimbursement")

    # Inbound fee: any Payment line whose description contains "inbound" (covers
    # 'FBA Inbound Pickup Service', 'FBA Inbound Transportation Fee', 'Inbound
    # Placement Service' etc.) AND whose date falls in the target month itself.
    # Amazon stores these as negative totals; flip the sign to make it a positive expense.
    inbound_total = 0.0
    inbound_matches = 0
    for p in month_txns:
        desc = _pay_desc(p).lower()
        if "inbound" not in desc:
            continue
        inbound_matches += 1
        inbound_total += _pay_total(p)
    inbound_fee = -inbound_total

    # Removal fee: from Payment report — any line whose description contains
    # "removal order" (case-insensitive) AND whose date is inside the target month.
    removal_total = 0.0
    removal_matches = 0
    for p in month_txns:
        desc = _pay_desc(p).lower()
        if "removal order" not in desc:
            continue
        removal_matches += 1
        removal_total += _pay_total(p)
    removal_fee = -removal_total

    # Storage fee: Amazon posts this on the 7th of the month AFTER the target month.
    # Only take storage lines dated INSIDE the following calendar month — not the target
    # month itself (that fee belongs to the previous month) and not month+2 or later
    # (that belongs to future months).
    next_month = target_month + 1 if target_month < 12 else 1
    next_year  = target_year if target_month < 12 else target_year + 1
    storage_start = pd.Timestamp(year=next_year, month=next_month, day=1, tz="UTC")
    if next_month == 12:
        storage_end = pd.Timestamp(year=next_year + 1, month=1, day=1, tz="UTC")
    else:
        storage_end = pd.Timestamp(year=next_year, month=next_month + 1, day=1, tz="UTC")

    storage_matches = []
    for p in payment:
        desc = _pay_desc(p).lower()
        if "storage" not in desc:
            continue
        d = _txn_date(p)
        if d is None:
            continue
        if storage_start <= d < storage_end:
            storage_matches.append(p)
    storage_fee = -sum(_pay_total(p) for p in storage_matches)

    # Removal fee: computed from the Payment report itself — any row whose description
    # contains "removal order" (case-insensitive) AND whose date is inside the target month.
    # Amazon stores these as negative totals; flip sign to positive expense.
    # (kept for compatibility — recomputed above with widened column matching)

    # Sponsored Products spend is reported net of GST by Amazon Ads.
    # Amazon invoices 18% GST on ad spend separately, so uplift by 1.18 to get
    # the true cash outflow that hits the seller's P&L.
    ad_total_ex_gst = sum(_num(col(a, "Spend", "spend")) for a in ad_spend)
    ad_total        = round(ad_total_ex_gst * 1.18, 2)

    # --- Operator-entered monthly extras ------------------------------------
    # Count of Merchant-fulfilled orders (Easy Ship) for the target month —
    # from the All Orders / MTR report. Amazon uses either "Merchant" or "MFN"
    # in the fulfillment-channel column depending on the report variant.
    _ORDER_DATE_HEADERS = ("purchase-date", "Purchase Date", "purchase date", "Order Date", "order-date", "Invoice Date", "invoice date")
    _FC_HEADERS         = ("fulfillment-channel", "Fulfillment Channel", "fulfillment channel", "Channel", "sales-channel", "Sales Channel")
    def _order_date(o):
        d = parse_date_any(col(o, *_ORDER_DATE_HEADERS))
        if d is None:
            for k, v in o.items():
                if not k: continue
                kl = k.strip().lower()
                if ("date" in kl) and v:
                    d = parse_date_any(v)
                    if d is not None: break
        if d is None:
            return None
        if d.tz is None:
            d = d.tz_localize("UTC")
        return d

    start = pd.Timestamp(year=target_year, month=target_month, day=1, tz="UTC")
    if target_month == 12:
        end = pd.Timestamp(year=target_year + 1, month=1, day=1, tz="UTC")
    else:
        end = pd.Timestamp(year=target_year, month=target_month + 1, day=1, tz="UTC")

    easyship_orders_count = 0
    for o in orders:
        fc = str(col(o, *_FC_HEADERS) or "").strip().lower()
        if fc not in ("merchant", "mfn"):
            continue
        d = _order_date(o)
        if d is None:
            continue
        if start <= d < end:
            easyship_orders_count += 1

    # Count of Payment lines whose description is exactly "FBA Inbound Pickup Service"
    # for the target month — reference only, not used in the calculation.
    inbound_shipments_count = 0
    for p in month_txns:
        desc = _pay_desc(p).strip().lower()
        if desc == "fba inbound pickup service":
            inbound_shipments_count += 1

    packing_per_easyship_raw   = float(extras.get("packing_cost_per_easyship") or 0)
    total_inbound_packing_raw  = float(extras.get("total_inbound_packing_cost") or 0)
    misc_cost_raw              = float(extras.get("misc_cost") or 0)

    packing_cost_easyship = round(packing_per_easyship_raw * easyship_orders_count, 2)
    packing_cost_inbound  = round(total_inbound_packing_raw, 2)
    misc_cost             = round(misc_cost_raw, 2)
    extras_total          = round(packing_cost_easyship + packing_cost_inbound + misc_cost, 2)

    total_received  = total_payment + reimbursement
    total_deduction = (total_cogs + inbound_fee + storage_fee + removal_fee + ad_total
                       + packing_cost_easyship + packing_cost_inbound + misc_cost)
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
    customer_return_pct = safe_div(customer_return_count, orders_count) if orders_count else 0.0
    rto_pct             = safe_div(rto_count, orders_count) if orders_count else 0.0

    # Diagnostics — surface what the parser saw so users can debug missing fees
    payment_rows_with_date = 0
    payment_desc_samples: list[str] = []
    payment_columns: list[str] = []
    if payment:
        payment_columns = list(payment[0].keys())
    seen_descs = set()
    for p in payment:
        if _txn_date(p) is not None:
            payment_rows_with_date += 1
        d = _pay_desc(p)
        if d and d not in seen_descs and len(payment_desc_samples) < 20:
            seen_descs.add(d)
            payment_desc_samples.append(d)
    diagnostics = {
        "payment_rows_total": len(payment),
        "payment_rows_with_date": payment_rows_with_date,
        "payment_rows_in_target_month": len(month_txns),
        "storage_matches": len(storage_matches),
        "inbound_matches": int(inbound_matches),
        "removal_matches": int(removal_matches),
        "payment_columns": payment_columns,
        "payment_desc_samples": payment_desc_samples,
    }

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
        "packing_cost_easyship":     packing_cost_easyship,
        "packing_cost_easyship_rate": round(packing_per_easyship_raw, 2),
        "packing_cost_inbound":      packing_cost_inbound,
        "misc_cost":                 misc_cost,
        "extras_total":              extras_total,
        "easyship_orders_count":     int(easyship_orders_count),
        "inbound_shipments_count":   int(inbound_shipments_count),
        "total_deduction": round(clean(total_deduction), 2),
        "final_profit": round(clean(final_profit), 2),
        "acos_pct": round(acos_pct, 2),
        "profit_pct": round(profit_pct, 2),
        "profit_pct_on_cogs": round(profit_on_cogs, 2),
        "return_pct": round(return_pct, 2),
        "customer_return_pct": round(customer_return_pct, 2),
        "rto_pct": round(rto_pct, 2),
        "customer_return_count": int(customer_return_count),
        "rto_count": int(rto_count),
        "total_item_price": round(clean(total_item_price), 2),
        "orders_count": int(orders_count),
        "returns_count": int(returns_count),
        "orphan_reimbursement_total": round(clean(orphan_total), 2),
        "orphan_reimbursements": orphan_reimbursements,
        "diagnostics": diagnostics,
    }
