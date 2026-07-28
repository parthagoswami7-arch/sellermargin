"""Main FastAPI server: auth (Emergent Google OAuth), reports, cost prices, payments, admin."""
from __future__ import annotations
import os, uuid, io, urllib.request, json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, UploadFile, File, Form, Cookie, Header, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
import stripe
from dotenv import load_dotenv

from parsers import parse_upload, FILE_TYPES
from pnl_engine import build_rows, unique_skus_needing_cost, compute_summary
from exporters import export_excel, export_pdf

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME   = os.environ["DB_NAME"]
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
ADMIN_EMAILS = {e.strip().lower() for e in (os.environ.get("ADMIN_EMAILS", "").split(",")) if e.strip()}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

stripe.api_key = STRIPE_API_KEY

app = FastAPI(title="Seller Margin — Amazon Monthly P&L Reconciliation")
api = APIRouter(prefix="/api")

# ---------------- utils ----------------
def now_utc():
    return datetime.now(timezone.utc)

def gen_id(prefix="id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

async def current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def user_status(user: dict) -> dict:
    trial_start = user.get("trial_start")
    if isinstance(trial_start, str):
        trial_start = datetime.fromisoformat(trial_start)
    if trial_start and trial_start.tzinfo is None:
        trial_start = trial_start.replace(tzinfo=timezone.utc)
    trial_end = (trial_start + timedelta(days=15)) if trial_start else now_utc()
    trial_days_left = max(0, int((trial_end - now_utc()).total_seconds() // 86400))

    paid_until = user.get("paid_until")
    if isinstance(paid_until, str):
        paid_until = datetime.fromisoformat(paid_until)
    if paid_until and paid_until.tzinfo is None:
        paid_until = paid_until.replace(tzinfo=timezone.utc)
    is_paid_active = bool(paid_until and paid_until > now_utc())
    paid_days_left = int((paid_until - now_utc()).total_seconds() // 86400) if is_paid_active else 0

    has_access = is_paid_active or now_utc() < trial_end
    return {
        "trial_start": (trial_start.isoformat() if trial_start else None),
        "trial_end": trial_end.isoformat(),
        "trial_days_left": trial_days_left,
        "paid_until": (paid_until.isoformat() if paid_until else None),
        "paid_days_left": paid_days_left,
        "is_paid": is_paid_active,           # active paying user
        "ever_paid": bool(user.get("is_paid")),
        "has_access": has_access,
        "is_admin": bool(user.get("is_admin")),
    }


# --- report-quota helpers ---
async def _distinct_months_used(user_id: str) -> int:
    """Return the count of DISTINCT (target_month, target_year) tuples for this user's reports.
    Deleting a report frees up its slot naturally (nothing to increment/decrement)."""
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": {"m": "$target_month", "y": "$target_year"}}},
        {"$count": "n"},
    ]
    async for row in db.reports.aggregate(pipeline):
        return int(row.get("n", 0))
    return 0


async def _has_month_report(user_id: str, m: int, y: int) -> bool:
    return (await db.reports.find_one(
        {"user_id": user_id, "target_month": m, "target_year": y},
        {"_id": 1},
    )) is not None


async def with_quota(user: dict) -> dict:
    """Merge report-quota fields into a user_status() dict. Admins get infinite quota."""
    st = user_status(user)
    used = await _distinct_months_used(user["user_id"])
    if user.get("is_admin"):
        st["reports_used"] = used
        st["reports_quota"] = 9999
        st["reports_remaining"] = 9999
        st["reports_unlimited"] = True
    else:
        quota = int(user.get("reports_quota") or 0)
        st["reports_used"] = used
        st["reports_quota"] = quota
        st["reports_remaining"] = max(0, quota - used)
        st["reports_unlimited"] = False
    return st

# ---------------- auth ----------------
@api.get("/")
async def root():
    return {"message": "Amazon P&L API", "time": now_utc().isoformat()}

# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
class SessionRequest(BaseModel):
    session_id: str

@api.post("/auth/session")
async def create_session(payload: SessionRequest, response: Response):
    req = urllib.request.Request(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": payload.session_id},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")

    email = data["email"].lower()
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        update = {"name": name or existing.get("name", ""), "picture": picture or existing.get("picture", "")}
        if email in ADMIN_EMAILS and not existing.get("is_admin"):
            update["is_admin"] = True
        await db.users.update_one({"user_id": user_id}, {"$set": update})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        # No automatic free trial anymore — users must redeem an activation code.
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "trial_start": now_utc(),
            "paid_until": None,
            "is_paid": False,
            "is_admin": email in ADMIN_EMAILS,
            "reports_quota": 0,
            "created_at": now_utc(),
        })

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {**user, "status": await with_quota(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {**user, "status": await with_quota(user)}

@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ---------------- cost prices library (per user) ----------------
class CostPrice(BaseModel):
    sku: str
    cost_price: float
    product_name: Optional[str] = ""

@api.get("/cost-prices")
async def list_costs(user: dict = Depends(current_user)):
    docs = await db.cost_prices.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(length=10000)
    return {"cost_prices": docs}

@api.post("/cost-prices")
async def upsert_cost(cp: CostPrice, user: dict = Depends(current_user)):
    await db.cost_prices.update_one(
        {"user_id": user["user_id"], "sku": cp.sku},
        {"$set": {"cost_price": float(cp.cost_price), "product_name": cp.product_name or "", "updated_at": now_utc()},
         "$setOnInsert": {"user_id": user["user_id"], "sku": cp.sku, "created_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True}

@api.post("/cost-prices/bulk")
async def bulk_costs(items: list[CostPrice], user: dict = Depends(current_user)):
    if not items:
        return {"ok": True, "count": 0}
    ops = [
        UpdateOne(
            {"user_id": user["user_id"], "sku": cp.sku},
            {"$set": {"cost_price": float(cp.cost_price), "product_name": cp.product_name or "", "updated_at": now_utc()},
             "$setOnInsert": {"user_id": user["user_id"], "sku": cp.sku, "created_at": now_utc()}},
            upsert=True,
        )
        for cp in items
    ]
    await db.cost_prices.bulk_write(ops, ordered=False)
    return {"ok": True, "count": len(items)}

@api.post("/cost-prices/import-csv")
async def import_costs_csv(file: UploadFile = File(...), user: dict = Depends(current_user)):
    """Import SKU cost prices from CSV/TSV. Expected columns: sku, cost_price, product_name (optional)."""
    raw = await file.read()
    text = raw.decode("utf-8", errors="replace").lstrip("\ufeff")
    import csv as _csv, io as _io
    # detect delimiter
    delim = ","
    if "\t" in text.splitlines()[0] if text else "":
        delim = "\t"
    reader = _csv.DictReader(_io.StringIO(text), delimiter=delim)
    added = 0
    skipped = 0
    errors: list[str] = []
    ops: list[UpdateOne] = []
    for i, row in enumerate(reader, start=2):
        # case-insensitive col lookup
        lc = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        sku = lc.get("sku") or lc.get("seller-sku") or lc.get("merchant-sku") or lc.get("skus")
        cp  = lc.get("cost_price") or lc.get("cost price") or lc.get("cost") or lc.get("unit cost") or lc.get("unit_cost")
        pn  = lc.get("product_name") or lc.get("product name") or lc.get("product") or lc.get("title") or ""
        if not sku or not cp:
            skipped += 1
            continue
        try:
            price = float(str(cp).replace(",", "").replace("₹", "").replace("$", ""))
        except Exception:
            errors.append(f"row {i}: bad cost '{cp}'")
            skipped += 1
            continue
        ops.append(UpdateOne(
            {"user_id": user["user_id"], "sku": sku},
            {"$set": {"cost_price": price, "product_name": pn, "updated_at": now_utc()},
             "$setOnInsert": {"user_id": user["user_id"], "sku": sku, "created_at": now_utc()}},
            upsert=True,
        ))
        added += 1
    if ops:
        await db.cost_prices.bulk_write(ops, ordered=False)
    return {"added": added, "skipped": skipped, "errors": errors[:20]}

# ---------------- reports ----------------
class CreateReport(BaseModel):
    name: Optional[str] = None
    target_month: int = Field(..., ge=1, le=12)
    target_year: int = Field(..., ge=2000, le=2100)

@api.post("/reports")
async def create_report(payload: CreateReport, user: dict = Depends(current_user)):
    # Enforce report quota per plan (admins bypass, regenerating same month bypasses)
    if not user.get("is_admin"):
        existing = await _has_month_report(user["user_id"], payload.target_month, payload.target_year)
        if not existing:
            used = await _distinct_months_used(user["user_id"])
            quota = int(user.get("reports_quota") or 0)
            if used >= quota:
                raise HTTPException(
                    status_code=402,
                    detail=(f"Report quota exhausted ({used}/{quota}). "
                            "Buy or renew a plan to get more reports. Existing months can still be re-generated for free."),
                )
    rid = gen_id("rep")
    doc = {
        "report_id": rid,
        "user_id": user["user_id"],
        "name": payload.name or f"P&L {payload.target_month:02d}/{payload.target_year}",
        "target_month": payload.target_month,
        "target_year": payload.target_year,
        "status": "draft",
        "files": {},        # ftype → {filename, count}
        "raw": {},          # ftype → list[dict]
        "rows": [],
        "summary": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.reports.insert_one(doc)
    return {"report_id": rid}

async def _get_report(rid: str, user: dict) -> dict:
    r = await db.reports.find_one({"report_id": rid, "user_id": user["user_id"]}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Report not found")
    return r

@api.get("/reports")
async def list_reports(user: dict = Depends(current_user)):
    docs = await db.reports.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "raw": 0, "rows": 0},
    ).sort("created_at", -1).to_list(length=500)
    return {"reports": docs}

@api.get("/reports/{rid}")
async def get_report(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    r.pop("raw", None)  # exclude raw
    return r

@api.delete("/reports/{rid}")
async def delete_report(rid: str, user: dict = Depends(current_user)):
    await db.reports.delete_one({"report_id": rid, "user_id": user["user_id"]})
    return {"ok": True}

@api.post("/reports/{rid}/upload")
async def upload_file(rid: str, file: UploadFile = File(...), user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    raw_bytes = await file.read()
    try:
        ftype, rows = parse_upload(raw_bytes, file.filename or "upload")
    except Exception as e:
        raise HTTPException(400, f"Parse error: {e}")

    files = r.get("files") or {}
    files[ftype] = {"filename": file.filename, "count": len(rows)}
    raw = r.get("raw") or {}
    raw[ftype] = rows
    await db.reports.update_one(
        {"report_id": rid},
        {"$set": {"files": files, "raw": raw, "updated_at": now_utc()}},
    )
    return {"detected_type": ftype, "rows": len(rows), "files": files}

@api.delete("/reports/{rid}/files/{ftype}")
async def remove_file(rid: str, ftype: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    files = r.get("files") or {}
    raw = r.get("raw") or {}
    files.pop(ftype, None)
    raw.pop(ftype, None)
    await db.reports.update_one(
        {"report_id": rid},
        {"$set": {"files": files, "raw": raw, "updated_at": now_utc()}},
    )
    return {"ok": True}

@api.post("/reports/{rid}/build")
async def build_report_rows(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    raw = r.get("raw") or {}
    if "orders" not in raw:
        raise HTTPException(400, "All Orders report is required")

    costs_docs = await db.cost_prices.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(length=100000)
    cost_map = {d["sku"]: float(d["cost_price"]) for d in costs_docs}

    rows = build_rows(
        orders=raw.get("orders", []),
        payment=raw.get("payment", []),
        fba_returns=raw.get("fba_returns", []),
        easyship_returns=raw.get("easyship_returns", []),
        cost_prices=cost_map,
    )
    skus = unique_skus_needing_cost(rows)
    await db.reports.update_one(
        {"report_id": rid},
        {"$set": {"rows": rows, "updated_at": now_utc(), "status": "cost_pending"}},
    )
    return {"rows_count": len(rows), "skus": skus, "missing_costs": [s for s in skus if not s["has_cost"]]}

class SkuCost(BaseModel):
    sku: str
    cost_price: float
    product_name: Optional[str] = ""

class SetCostsPayload(BaseModel):
    costs: list[SkuCost]

@api.post("/reports/{rid}/costs")
async def set_costs(rid: str, payload: SetCostsPayload, user: dict = Depends(current_user)):
    """Persist SKU costs to user's library AND apply defaults to this report's rows."""
    r = await _get_report(rid, user)
    if payload.costs:
        ops = [
            UpdateOne(
                {"user_id": user["user_id"], "sku": c.sku},
                {"$set": {"cost_price": float(c.cost_price), "product_name": c.product_name or "", "updated_at": now_utc()},
                 "$setOnInsert": {"user_id": user["user_id"], "sku": c.sku, "created_at": now_utc()}},
                upsert=True,
            )
            for c in payload.costs
        ]
        await db.cost_prices.bulk_write(ops, ordered=False)
    cost_map = {c.sku: float(c.cost_price) for c in payload.costs}
    rows = r.get("rows") or []
    for row in rows:
        if row["sku"] in cost_map:
            row["cost_price_unit"] = cost_map[row["sku"]]
    await db.reports.update_one(
        {"report_id": rid},
        {"$set": {"rows": rows, "updated_at": now_utc()}},
    )
    return {"ok": True, "updated": len(payload.costs)}

class ReturnOverride(BaseModel):
    order_id: str
    cost_price_unit_override: Optional[float] = None

@api.post("/reports/{rid}/return-overrides")
async def set_return_overrides(rid: str, items: list[ReturnOverride], user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    ovr = {o.order_id: o.cost_price_unit_override for o in items}
    rows = r.get("rows") or []
    for row in rows:
        if row["order_id"] in ovr:
            row["cost_price_unit_override"] = ovr[row["order_id"]]
    await db.reports.update_one(
        {"report_id": rid},
        {"$set": {"rows": rows, "updated_at": now_utc()}},
    )
    return {"ok": True, "updated": len(items)}

@api.post("/reports/{rid}/finalize")
async def finalize_report(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    raw = r.get("raw") or {}
    rows = r.get("rows") or []
    if not rows:
        raise HTTPException(400, "Build report rows first")
    summary = compute_summary(
        rows=rows,
        payment=raw.get("payment", []),
        fba_removal=raw.get("fba_removal", []),
        ad_spend=raw.get("ad_spend", []),
        target_month=r["target_month"],
        target_year=r["target_year"],
    )
    await db.reports.update_one(
        {"report_id": rid},
        {"$set": {"summary": summary, "status": "finalized", "updated_at": now_utc()}},
    )
    return {"summary": summary}

@api.get("/reports/{rid}/rows")
async def get_rows(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    return {"rows": r.get("rows", []), "target_month": r["target_month"], "target_year": r["target_year"]}

@api.get("/reports/{rid}/returns")
async def get_returns(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    rows = [row for row in (r.get("rows") or []) if row.get("is_return")]
    return {"returns": rows}

@api.get("/reports/{rid}/export.xlsx")
async def export_xlsx(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    if not r.get("summary"):
        raise HTTPException(400, "Finalize the report first")
    data = export_excel(r)
    return StreamingResponse(io.BytesIO(data), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{r["name"]}.xlsx"'})

@api.get("/reports/{rid}/export.pdf")
async def export_pdf_ep(rid: str, user: dict = Depends(current_user)):
    r = await _get_report(rid, user)
    if not r.get("summary"):
        raise HTTPException(400, "Finalize the report first")
    data = export_pdf(r)
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{r["name"]}.pdf"'})

# ---------------- plans + activation codes ----------------
async def require_admin(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user

PLANS = {
    "trial_10": {"id": "trial_10", "days": 7,   "price_inr": 49,  "label": "7-Day Trial",   "amount": 0.65, "currency": "usd", "gst_pct": 18, "reports_quota": 1,  "available": True},
    "annual":   {"id": "annual",   "days": 365, "price_inr": 499, "list_price_inr": 599, "label": "1-Year Access", "amount": 6.0,  "currency": "usd", "gst_pct": 18, "reports_quota": 12, "available": True, "discount_note": "Launch offer — save Rs.100"},
    "topup_5":  {"id": "topup_5",  "days": 0,   "price_inr": 249, "label": "5 Extra Reports", "amount": 3.0,  "currency": "usd", "gst_pct": 18, "reports_quota": 5,  "available": True, "is_topup": True},
}

# Cards shown as "Coming soon" — not yet purchasable through Cashfree.
UPCOMING_PLANS = {
    "agency_starter": {"id": "agency_starter", "days": 365, "price_inr": 1999,
                       "label": "Agency Starter", "gst_pct": 18, "reports_quota": 60,
                       "available": False, "note": "Coming soon",
                       "tagline": "For accountants & agencies handling multiple sellers"},
}

# ---------------- payments (Flow B, one-time yearly) ----------------
YEARLY_PACKAGE = PLANS["annual"]

def _extend_paid_until(current, days: int) -> datetime:
    """Extend paid_until by `days`, starting from now or current expiry (whichever is later)."""
    base = now_utc()
    if current:
        if isinstance(current, str):
            current = datetime.fromisoformat(current)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        if current > base:
            base = current
    return base + timedelta(days=days)


def _gen_code() -> str:
    """Format: SM-XXXX-XXXX-XXXX (SM = Seller Margin), uppercase, no ambiguous chars."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    import secrets
    chunks = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    return "SM-" + "-".join(chunks)


class RedeemReq(BaseModel):
    code: str

@api.post("/codes/redeem")
async def redeem_code(payload: RedeemReq, user: dict = Depends(current_user)):
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Enter an activation code")
    rec = await db.activation_codes.find_one({"code": code}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Invalid activation code")
    if rec.get("status") == "used":
        raise HTTPException(400, "This code has already been used")

    plan = PLANS.get(rec["plan"])
    if not plan:
        raise HTTPException(400, "Unknown plan on this code")

    fresh_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    set_update = {"last_paid_at": now_utc(), "last_plan": plan["id"]}
    new_expiry = None
    if int(plan.get("days") or 0) > 0:
        new_expiry = _extend_paid_until(fresh_user.get("paid_until"), plan["days"])
        set_update["is_paid"] = True
        set_update["paid_until"] = new_expiry
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": set_update,
         "$inc": {"reports_quota": int(plan.get("reports_quota") or 0)}},
    )
    await db.activation_codes.update_one(
        {"code": code},
        {"$set": {"status": "used", "used_by": user["user_id"], "used_by_email": user.get("email"),
                  "used_at": now_utc()}},
    )
    return {"ok": True, "plan": plan,
            "paid_until": (new_expiry.isoformat() if new_expiry else (fresh_user.get("paid_until").isoformat() if isinstance(fresh_user.get("paid_until"), datetime) else fresh_user.get("paid_until"))),
            "reports_added": int(plan.get("reports_quota") or 0),
            "is_topup": bool(plan.get("is_topup"))}


# ---------------- admin: codes ----------------
class GenerateCodesReq(BaseModel):
    plan: str
    count: int = Field(..., ge=1, le=500)

@api.post("/admin/codes/generate")
async def admin_generate_codes(payload: GenerateCodesReq, _: dict = Depends(require_admin)):
    if payload.plan not in PLANS:
        raise HTTPException(400, f"Unknown plan '{payload.plan}'")
    codes = []
    for _i in range(payload.count):
        # Ensure uniqueness (loop until unique — extremely unlikely to collide but safe)
        while True:
            c = _gen_code()
            existing = await db.activation_codes.find_one({"code": c}, {"_id": 0})
            if not existing:
                break
        doc = {
            "code": c,
            "plan": payload.plan,
            "status": "active",
            "used_by": None,
            "used_by_email": None,
            "used_at": None,
            "created_at": now_utc(),
        }
        await db.activation_codes.insert_one(doc)
        codes.append(c)
    return {"codes": codes}

@api.get("/admin/codes")
async def admin_list_codes(_: dict = Depends(require_admin)):
    docs = await db.activation_codes.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=2000)
    return {"codes": docs}


@api.get("/plans")
async def public_plans():
    return {"plans": PLANS, "upcoming_plans": UPCOMING_PLANS}


# ---------------- Cashfree checkout ----------------
from cashfree import cf_create_order, cf_get_order, cf_verify_webhook, send_activation_email
from invoice import (SELLER_DEFAULTS, STATE_CODES, compute_gst, build_invoice_number,
                     render_invoice_pdf)
from pymongo import ReturnDocument, UpdateOne

PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")


async def get_seller_settings() -> dict:
    """Return the current seller/business settings, seeded with placeholders on first call."""
    doc = await db.settings.find_one({"key": "seller"}, {"_id": 0})
    if not doc:
        doc = {"key": "seller", **SELLER_DEFAULTS, "updated_at": now_utc()}
        await db.settings.insert_one({**doc})
    doc.pop("_id", None)
    return doc


async def _next_invoice_seq(dt: datetime) -> int:
    """Atomically increment the invoice sequence for the given financial year."""
    from invoice import _fy_label
    fy = _fy_label(dt)
    r = await db.settings.find_one_and_update(
        {"key": f"invoice_seq_{fy}"},
        {"$inc": {"seq": 1}, "$setOnInsert": {"key": f"invoice_seq_{fy}", "created_at": now_utc()}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return int(r.get("seq", 1)) if r else 1


class CheckoutOrderReq(BaseModel):
    plan: str
    phone: Optional[str] = "9999999999"
    # Optional GST invoice details (buyer can skip entirely)
    wants_invoice: bool = False
    buyer_name: Optional[str] = None
    buyer_gstin: Optional[str] = None
    buyer_billing_address: Optional[str] = None
    buyer_state: Optional[str] = None

@api.post("/payments/cf/create-order")
async def cf_create(payload: CheckoutOrderReq, user: dict = Depends(current_user)):
    plan = PLANS.get(payload.plan)
    if not plan:
        raise HTTPException(400, "Unknown plan")
    seller = await get_seller_settings()
    gst = compute_gst(plan["price_inr"], payload.buyer_state, seller["state"])
    order_id = f"sm_{plan['id']}_{uuid.uuid4().hex[:10]}"
    return_url = f"{PUBLIC_APP_URL}/payment/success?order_id={order_id}"
    notify_url = f"{PUBLIC_APP_URL}/api/webhook/cashfree"
    try:
        cf = await cf_create_order(order_id, gst["total"],
            {"id": user["user_id"], "name": user.get("name") or user["email"].split("@")[0],
             "email": user["email"], "phone": payload.phone or "9999999999"},
            return_url, notify_url)
    except Exception as e:
        raise HTTPException(502, f"Cashfree error: {e}")
    await db.cf_orders.insert_one({
        "order_id": order_id, "cf_order_id": cf.get("cf_order_id"),
        "payment_session_id": cf["payment_session_id"],
        "user_id": user["user_id"], "user_email": user["email"],
        "plan": plan["id"],
        # Amount fields — `amount` retained for backwards-compat = total charged
        "amount": gst["total"],
        "base_amount": gst["base"],
        "gst": {"cgst": gst["cgst"], "sgst": gst["sgst"], "igst": gst["igst"],
                "cgst_pct": gst["cgst_pct"], "sgst_pct": gst["sgst_pct"], "igst_pct": gst["igst_pct"],
                "total_tax": gst["total_tax"], "intra_state": gst["intra_state"]},
        "currency": "INR",
        # GST invoice buyer details (optional)
        "wants_invoice": bool(payload.wants_invoice),
        "buyer_name": payload.buyer_name,
        "buyer_gstin": (payload.buyer_gstin or "").strip().upper() or None,
        "buyer_billing_address": payload.buyer_billing_address,
        "buyer_state": payload.buyer_state,
        "status": cf.get("order_status", "ACTIVE"), "code_delivered": False,
        "created_at": now_utc(), "updated_at": now_utc(),
    })
    return {
        "order_id": order_id, "payment_session_id": cf["payment_session_id"],
        "env": os.environ.get("CF_ENV", "sandbox"),
        "amount_breakdown": {
            "base": gst["base"], "total_tax": gst["total_tax"], "total": gst["total"],
            "cgst": gst["cgst"], "sgst": gst["sgst"], "igst": gst["igst"],
            "intra_state": gst["intra_state"],
        },
    }

async def _fulfill_order_if_paid(order_id: str) -> dict:
    """Idempotently: if the Cashfree order is PAID and we haven't fulfilled yet,
    generate a code, redeem it for the buyer, and email them."""
    rec = await db.cf_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Order not found")
    # If already fulfilled, just return current state
    if rec.get("code_delivered"):
        return {"status": rec["status"], "code": rec.get("code"), "paid": True}
    # Verify with Cashfree
    try:
        cf = await cf_get_order(order_id)
    except Exception as e:
        raise HTTPException(502, f"Cashfree verify error: {e}")
    status = cf.get("order_status")
    await db.cf_orders.update_one({"order_id": order_id},
        {"$set": {"status": status, "updated_at": now_utc()}})
    if status != "PAID":
        return {"status": status, "paid": False}

    # Atomically mark delivered so a webhook + poll can't double-fulfill
    upd = await db.cf_orders.update_one(
        {"order_id": order_id, "code_delivered": {"$ne": True}},
        {"$set": {"code_delivered": True, "delivered_at": now_utc()}},
    )
    if upd.modified_count == 0:
        rec = await db.cf_orders.find_one({"order_id": order_id}, {"_id": 0})
        return {"status": "PAID", "code": rec.get("code"), "paid": True}

    # Generate + record + auto-redeem for the buyer
    plan = PLANS[rec["plan"]]
    code = _gen_code()
    await db.activation_codes.insert_one({
        "code": code, "plan": rec["plan"], "status": "used",
        "used_by": rec["user_id"], "used_by_email": rec["user_email"],
        "used_at": now_utc(), "created_at": now_utc(),
        "source": "cashfree", "order_id": order_id,
    })
    buyer = await db.users.find_one({"user_id": rec["user_id"]}, {"_id": 0})
    set_update = {"last_paid_at": now_utc(), "last_plan": plan["id"]}
    new_expiry = None
    if int(plan.get("days") or 0) > 0:
        new_expiry = _extend_paid_until(buyer.get("paid_until") if buyer else None, plan["days"])
        set_update["is_paid"] = True
        set_update["paid_until"] = new_expiry
    else:
        # Topups don't extend access — reuse whatever expiry the buyer already has (if any)
        raw = buyer.get("paid_until") if buyer else None
        if isinstance(raw, str):
            raw = datetime.fromisoformat(raw)
        new_expiry = raw
    await db.users.update_one({"user_id": rec["user_id"]},
        {"$set": set_update,
         "$inc": {"reports_quota": int(plan.get("reports_quota") or 0)}})

    # Always generate an invoice on successful payment (buyer can pick it up whether or not they
    # provided GSTIN — unregistered buyers just get an invoice with "Unregistered" printed).
    now = now_utc()
    seq = await _next_invoice_seq(now)
    invoice_no = build_invoice_number(seq, now)
    cf_payment_id = None
    try:
        cf_payment_id = cf.get("cf_order_id") if cf else None
    except Exception:
        cf_payment_id = None
    invoice_url = f"{PUBLIC_APP_URL}/api/invoices/{order_id}.pdf?token={_sign_invoice_token(order_id)}" if PUBLIC_APP_URL else None

    await db.cf_orders.update_one({"order_id": order_id},
        {"$set": {"code": code, "paid_until": new_expiry,
                  "invoice_no": invoice_no, "invoice_url": invoice_url,
                  "invoice_generated_at": now}})

    gst_total = rec.get("amount") or 0.0
    expiry_iso_safe = new_expiry.isoformat() if new_expiry else ""
    email_result = await send_activation_email(
        to_email=rec["user_email"], code=code, plan_label=plan["label"],
        days=plan["days"], site_url=PUBLIC_APP_URL, expiry_iso=expiry_iso_safe,
        invoice_url=invoice_url, invoice_no=invoice_no, gst_total=float(gst_total),
    )
    # Store email delivery state separately from code_delivered so admins can retry
    await db.cf_orders.update_one({"order_id": order_id},
        {"$set": {
            "email_sent":     bool(email_result.get("ok")),
            "email_send_id":  email_result.get("id"),
            "email_error":    email_result.get("error"),
            "email_last_attempt": now_utc(),
        }})
    return {"status": "PAID", "code": code, "paid": True,
            "paid_until": (new_expiry.isoformat() if new_expiry else None),
            "invoice_no": invoice_no, "invoice_url": invoice_url,
            "reports_added": int(plan.get("reports_quota") or 0),
            "is_topup": bool(plan.get("is_topup")),
            "email_sent": bool(email_result.get("ok"))}

@api.get("/payments/cf/verify/{order_id}")
async def cf_verify(order_id: str, user: dict = Depends(current_user)):
    rec = await db.cf_orders.find_one({"order_id": order_id, "user_id": user["user_id"]}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Order not found")
    result = await _fulfill_order_if_paid(order_id)
    return result

@app.post("/api/webhook/cashfree")
async def cf_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("x-webhook-signature", "")
    ts  = request.headers.get("x-webhook-timestamp", "")
    if not cf_verify_webhook(raw, sig, ts):
        raise HTTPException(401, "Invalid signature")
    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON")
    order_id = payload.get("data", {}).get("order", {}).get("order_id")
    if order_id:
        try:
            await _fulfill_order_if_paid(order_id)
        except Exception as e:
            print("webhook fulfill error:", e)
    return {"ok": True}

@api.get("/admin/orders")
async def admin_orders(_: dict = Depends(require_admin)):
    docs = await db.cf_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return {"orders": docs}


@api.get("/admin/cf-config")
async def admin_cf_config(_: dict = Depends(require_admin)):
    """Return current Cashfree environment info so the Admin UI can prompt the operator
    to whitelist the correct domain in the Cashfree merchant dashboard."""
    return {
        "cf_env": os.environ.get("CF_ENV", "sandbox"),
        "public_app_url": PUBLIC_APP_URL or "",
        "whitelist_url": "https://merchant.cashfree.com/merchants/pg/developers/whitelisting",
        "webhook_url": (f"{PUBLIC_APP_URL}/api/webhook/cashfree" if PUBLIC_APP_URL else ""),
    }


@api.post("/admin/orders/{order_id}/resend-email")
async def admin_resend_email(order_id: str, _: dict = Depends(require_admin)):
    """Resend the post-purchase activation email for a PAID order. Uses the existing
    code + invoice from the order. Common cases: buyer says they never got the email,
    buyer's spam filter ate it, buyer wants it forwarded to a different address."""
    rec = await db.cf_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Order not found")
    if not rec.get("code_delivered"):
        raise HTTPException(400, "Order not fulfilled yet — nothing to resend")
    plan = PLANS.get(rec.get("plan")) or {}
    invoice_no = rec.get("invoice_no")
    invoice_url = (f"{PUBLIC_APP_URL}/api/invoices/{order_id}.pdf?token={_sign_invoice_token(order_id)}"
                   if PUBLIC_APP_URL and invoice_no else None)
    expiry_iso = ""
    if rec.get("paid_until"):
        raw = rec["paid_until"]
        expiry_iso = raw if isinstance(raw, str) else raw.isoformat()
    result = await send_activation_email(
        to_email=rec["user_email"], code=rec.get("code") or "—",
        plan_label=plan.get("label", rec.get("plan", "Access")),
        days=int(plan.get("days") or 0), site_url=PUBLIC_APP_URL,
        expiry_iso=expiry_iso, invoice_url=invoice_url, invoice_no=invoice_no,
        gst_total=float(rec.get("amount") or 0),
    )
    await db.cf_orders.update_one({"order_id": order_id},
        {"$set": {
            "email_sent": bool(result.get("ok")),
            "email_send_id": result.get("id"),
            "email_error": result.get("error"),
            "email_last_attempt": now_utc(),
        }})
    if not result.get("ok"):
        raise HTTPException(502, f"Email send failed: {result.get('error')}")
    return {"ok": True, "id": result.get("id"), "sent_to": rec["user_email"]}


@api.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, admin: dict = Depends(require_admin)):
    rec = await db.cf_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Order not found")

    # Reverse report quota if it was granted
    plan = PLANS.get(rec.get("plan"), {})
    quota_granted = int(plan.get("reports_quota") or 0) if rec.get("code_delivered") else 0
    if quota_granted > 0 and rec.get("user_id"):
        # Never let quota go negative
        user = await db.users.find_one({"user_id": rec["user_id"]}, {"reports_quota": 1})
        cur_quota = int((user or {}).get("reports_quota") or 0)
        new_quota = max(0, cur_quota - quota_granted)
        await db.users.update_one(
            {"user_id": rec["user_id"]},
            {"$set": {"reports_quota": new_quota}},
        )

    # Remove linked activation code (if any)
    if rec.get("code"):
        await db.activation_codes.delete_one({"code": rec["code"]})

    await db.cf_orders.delete_one({"order_id": order_id})
    return {
        "ok": True,
        "order_id": order_id,
        "quota_reversed": quota_granted,
        "code_deleted": rec.get("code") or None,
        "deleted_by": admin.get("email"),
    }


# ---------------- Admin exports (Sales CSV + GSTR-1 Excel) ----------------
from gst_exports import build_sales_csv, build_gstr1_excel


@api.get("/admin/exports/sales.csv")
async def admin_export_sales_csv(from_date: Optional[str] = None,
                                 to_date: Optional[str] = None,
                                 _: dict = Depends(require_admin)):
    """Sales CSV of all PAID Cashfree orders in [from_date, to_date] (ISO YYYY-MM-DD).
    Both bounds inclusive. Omit both to get everything."""
    q: dict = {"code_delivered": True}
    if from_date or to_date:
        rng: dict = {}
        if from_date:
            rng["$gte"] = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
        if to_date:
            rng["$lte"] = datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc) + timedelta(days=1)
        q["invoice_generated_at"] = rng
    orders = await db.cf_orders.find(q, {"_id": 0}).sort("invoice_generated_at", 1).to_list(length=5000)
    seller = await get_seller_settings()
    csv_bytes = build_sales_csv(orders, seller)
    tag = f"{from_date or 'all'}_to_{to_date or 'now'}"
    return Response(
        content=csv_bytes, media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="sales_{tag}.csv"'},
    )


@api.get("/admin/exports/gstr1.xlsx")
async def admin_export_gstr1(month: int, year: int, _: dict = Depends(require_admin)):
    """GSTR-1 filing Excel for the given calendar month.
    Two sheets: b2b (registered buyers with GSTIN), b2cs (unregistered aggregated by state)."""
    if not (1 <= month <= 12) or not (2020 <= year <= 2100):
        raise HTTPException(400, "Invalid month/year")
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    orders = await db.cf_orders.find(
        {"code_delivered": True, "invoice_generated_at": {"$gte": start, "$lt": end}},
        {"_id": 0},
    ).sort("invoice_generated_at", 1).to_list(length=5000)
    seller = await get_seller_settings()
    xlsx = build_gstr1_excel(orders, seller, month, year)
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="GSTR1_{month:02d}{year}.xlsx"'},
    )


@api.get("/admin/exports/summary")
async def admin_export_summary(_: dict = Depends(require_admin)):
    """Quick period-based totals for the Admin UI to render cards.
    Returns totals for: this month, last month, this FY."""
    now = now_utc()
    # This month
    tm_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    # Last month
    if now.month == 1:
        lm_start = datetime(now.year - 1, 12, 1, tzinfo=timezone.utc)
        lm_end = tm_start
    else:
        lm_start = datetime(now.year, now.month - 1, 1, tzinfo=timezone.utc)
        lm_end = tm_start
    # This FY (April-March)
    fy_year = now.year if now.month >= 4 else now.year - 1
    fy_start = datetime(fy_year, 4, 1, tzinfo=timezone.utc)

    async def _sum(q):
        docs = await db.cf_orders.find(q, {"_id": 0, "base_amount": 1, "amount": 1, "gst": 1}).to_list(length=10000)
        gross = sum(float(d.get("amount") or 0) for d in docs)
        taxable = sum(float(d.get("base_amount") or 0) for d in docs)
        gst = sum(float((d.get("gst") or {}).get("total_tax") or 0) for d in docs)
        return {"gross": round(gross, 2), "taxable": round(taxable, 2), "gst": round(gst, 2), "count": len(docs)}

    return {
        "this_month": await _sum({"code_delivered": True, "invoice_generated_at": {"$gte": tm_start}}),
        "last_month": await _sum({"code_delivered": True, "invoice_generated_at": {"$gte": lm_start, "$lt": lm_end}}),
        "this_fy":    await _sum({"code_delivered": True, "invoice_generated_at": {"$gte": fy_start}}),
    }


import hmac as _hmac, hashlib as _hashlib
INVOICE_URL_SECRET = os.environ.get("SESSION_SECRET") or os.environ.get("EMERGENT_EMAIL_KEY", "seller-margin-fallback")


def _sign_invoice_token(order_id: str) -> str:
    return _hmac.new(INVOICE_URL_SECRET.encode(), order_id.encode(), _hashlib.sha256).hexdigest()[:32]


# ---------------- GST Invoice download ----------------
@api.get("/invoices/{order_id}.pdf")
async def download_invoice(order_id: str, request: Request, token: Optional[str] = None):
    rec = await db.cf_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Order not found")
    # Authorize: either signed token from the emailed link, or logged-in buyer/admin
    valid_token = bool(token) and _hmac.compare_digest(_sign_invoice_token(order_id), token)
    if not valid_token:
        try:
            user = await current_user(request)
        except HTTPException:
            raise HTTPException(401, "Sign in or use the invoice link from your email")
        if rec.get("user_id") != user.get("user_id") and not user.get("is_admin"):
            raise HTTPException(403, "Not your invoice")
    if not rec.get("code_delivered"):
        raise HTTPException(400, "Invoice is available only after successful payment")

    seller = await get_seller_settings()
    gst_stored = rec.get("gst") or {}
    base = float(rec.get("base_amount") or 0)
    gst = {
        "base": base,
        "cgst": float(gst_stored.get("cgst", 0)),
        "sgst": float(gst_stored.get("sgst", 0)),
        "igst": float(gst_stored.get("igst", 0)),
        "cgst_pct": float(gst_stored.get("cgst_pct", 0)),
        "sgst_pct": float(gst_stored.get("sgst_pct", 0)),
        "igst_pct": float(gst_stored.get("igst_pct", 0)),
        "total_tax": float(gst_stored.get("total_tax", 0)),
        "total": float(rec.get("amount") or (base + float(gst_stored.get("total_tax", 0)))),
        "intra_state": bool(gst_stored.get("intra_state", True)),
    }
    plan = PLANS.get(rec["plan"], {})
    buyer = {
        "name": rec.get("buyer_name") or rec.get("user_email", ""),
        "gstin": rec.get("buyer_gstin"),
        "address": rec.get("buyer_billing_address"),
        "state": rec.get("buyer_state"),
        "email": rec.get("user_email"),
    }
    inv_date = rec.get("invoice_generated_at") or rec.get("created_at") or now_utc()
    pdf = render_invoice_pdf(
        invoice_no=rec.get("invoice_no") or "SM/DRAFT/0000",
        invoice_date=inv_date, order_id=order_id,
        cf_payment_id=rec.get("cf_order_id"),
        seller=seller, buyer=buyer,
        plan_label=plan.get("label", rec.get("plan", "")),
        plan_days=int(plan.get("days", 0) or 0),
        gst=gst,
    )
    filename = (rec.get("invoice_no") or f"invoice-{order_id}").replace("/", "-") + ".pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


# ---------------- Seller / Business settings ----------------
class SellerSettingsReq(BaseModel):
    business_name: str
    gstin: str
    pan: Optional[str] = ""
    address_line1: str
    address_line2: Optional[str] = ""
    state: str
    state_code: Optional[str] = ""
    contact_email: Optional[str] = ""
    phone: Optional[str] = ""
    website: Optional[str] = ""
    sac_code: Optional[str] = "998314"
    hsn_description: Optional[str] = ""


@api.get("/settings/seller")
async def public_seller():
    """Public — used to preview seller info on checkout / pricing page."""
    s = await get_seller_settings()
    return {"seller": {k: s.get(k) for k in
        ["business_name", "gstin", "state", "state_code", "contact_email", "website", "sac_code"]}}


@api.get("/settings/india-states")
async def india_states():
    return {"states": [{"name": n, "code": c} for n, c in sorted(STATE_CODES.items())]}


@api.get("/admin/settings/seller")
async def admin_get_seller(_: dict = Depends(require_admin)):
    return {"seller": await get_seller_settings()}


@api.put("/admin/settings/seller")
async def admin_put_seller(payload: SellerSettingsReq, _: dict = Depends(require_admin)):
    data = payload.model_dump()
    # Auto-fill state_code from name if not provided or mismatched
    st_from_map = STATE_CODES.get(data["state"], "")
    if not data.get("state_code") or (st_from_map and data["state_code"] != st_from_map):
        data["state_code"] = st_from_map or data.get("state_code", "")
    data["gstin"] = (data["gstin"] or "").strip().upper()
    await db.settings.update_one(
        {"key": "seller"},
        {"$set": {**data, "key": "seller", "updated_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True, "seller": await get_seller_settings()}

class CheckoutReq(BaseModel):
    origin_url: str

@api.post("/payments/checkout")
async def create_checkout(payload: CheckoutReq, request: Request, user: dict = Depends(current_user)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    success = f"{payload.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel  = f"{payload.origin_url}/payment/cancel"
    req = CheckoutSessionRequest(
        amount=YEARLY_PACKAGE["amount"],
        currency=YEARLY_PACKAGE["currency"],
        success_url=success,
        cancel_url=cancel,
        metadata={"user_id": user["user_id"], "package_id": YEARLY_PACKAGE["id"]},
    )
    session = await checkout.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "user_id": user["user_id"],
        "package_id": YEARLY_PACKAGE["id"],
        "amount": YEARLY_PACKAGE["amount"],
        "currency": YEARLY_PACKAGE["currency"],
        "status": "initiated",
        "payment_status": "pending",
        "created_at": now_utc(),
        "updated_at": now_utc(),
    })
    return {"checkout_url": session.url, "session_id": session.session_id}

async def _mark_user_paid(user_id: str):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return
    new_expiry = _extend_paid_until(user.get("paid_until"), YEARLY_PACKAGE["days"])
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_paid": True, "paid_until": new_expiry, "last_paid_at": now_utc()},
         "$inc": {"reports_quota": int(YEARLY_PACKAGE.get("reports_quota") or 0)}},
    )

@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "Not found")
    if rec.get("payment_status") != "paid":
        try:
            checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
            status = await checkout.get_checkout_status(session_id)
            if status.payment_status == "paid" or status.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_utc()}},
                )
                await _mark_user_paid(rec["user_id"])
                rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except Exception:
            pass
    return {"session_id": rec["session_id"], "status": rec["status"], "payment_status": rec["payment_status"]}

@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    try:
        evt = await checkout.handle_webhook(body, sig)
    except Exception as e:
        raise HTTPException(400, f"Webhook error: {e}")
    if evt.payment_status == "paid" and evt.session_id:
        rec = await db.payment_transactions.find_one({"session_id": evt.session_id}, {"_id": 0})
        if rec and rec.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"status": "completed", "payment_status": "paid", "updated_at": now_utc()}},
            )
            await _mark_user_paid(rec["user_id"])
    return {"ok": True}

@api.get("/plan")
async def plan():
    return {"package": YEARLY_PACKAGE}

# ---------------- admin ----------------
@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    paid_users = await db.users.count_documents({"is_paid": True})
    trial_users = total_users - paid_users
    total_reports = await db.reports.count_documents({})
    revenue_cursor = db.payment_transactions.find({"payment_status": "paid"}, {"_id": 0, "amount": 1, "currency": 1})
    revenue = 0.0
    async for r in revenue_cursor:
        revenue += float(r.get("amount", 0))
    return {
        "total_users": total_users,
        "paid_users": paid_users,
        "trial_users": trial_users,
        "total_reports": total_reports,
        "revenue_usd": round(revenue, 2),
    }

@api.get("/admin/users")
async def admin_users(_: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    return {"users": users}

@api.get("/admin/payments")
async def admin_payments(_: dict = Depends(require_admin)):
    docs = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    return {"payments": docs}

# ---------------- setup ----------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def indexes():
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.reports.create_index([("user_id", 1), ("created_at", -1)])
    await db.reports.create_index([("user_id", 1), ("target_month", 1), ("target_year", 1)])
    await db.reports.create_index("report_id", unique=True)
    await db.cost_prices.create_index([("user_id", 1), ("sku", 1)], unique=True)
    await db.payment_transactions.create_index("session_id", unique=True)
