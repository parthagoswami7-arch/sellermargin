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

app = FastAPI(title="Amazon Monthly P&L Reconciliation")
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
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "trial_start": now_utc(),
            "is_paid": False,
            "is_admin": email in ADMIN_EMAILS,
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
    return {**user, "status": user_status(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {**user, "status": user_status(user)}

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
    for cp in items:
        await db.cost_prices.update_one(
            {"user_id": user["user_id"], "sku": cp.sku},
            {"$set": {"cost_price": float(cp.cost_price), "product_name": cp.product_name or "", "updated_at": now_utc()},
             "$setOnInsert": {"user_id": user["user_id"], "sku": cp.sku, "created_at": now_utc()}},
            upsert=True,
        )
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
        await db.cost_prices.update_one(
            {"user_id": user["user_id"], "sku": sku},
            {"$set": {"cost_price": price, "product_name": pn, "updated_at": now_utc()},
             "$setOnInsert": {"user_id": user["user_id"], "sku": sku, "created_at": now_utc()}},
            upsert=True,
        )
        added += 1
    return {"added": added, "skipped": skipped, "errors": errors[:20]}

# ---------------- reports ----------------
class CreateReport(BaseModel):
    name: Optional[str] = None
    target_month: int = Field(..., ge=1, le=12)
    target_year: int = Field(..., ge=2000, le=2100)

@api.post("/reports")
async def create_report(payload: CreateReport, user: dict = Depends(current_user)):
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
    for c in payload.costs:
        await db.cost_prices.update_one(
            {"user_id": user["user_id"], "sku": c.sku},
            {"$set": {"cost_price": float(c.cost_price), "product_name": c.product_name or "", "updated_at": now_utc()},
             "$setOnInsert": {"user_id": user["user_id"], "sku": c.sku, "created_at": now_utc()}},
            upsert=True,
        )
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

# ---------------- payments (Flow B, one-time yearly) ----------------
YEARLY_PACKAGE = {"id": "yearly", "amount": 3.0, "currency": "usd", "label": "Annual Access (₹249 / year)", "days": 365}

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
        {"$set": {"is_paid": True, "paid_until": new_expiry, "last_paid_at": now_utc()}},
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
async def require_admin(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return user

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
    await db.reports.create_index("report_id", unique=True)
    await db.cost_prices.create_index([("user_id", 1), ("sku", 1)], unique=True)
    await db.payment_transactions.create_index("session_id", unique=True)
