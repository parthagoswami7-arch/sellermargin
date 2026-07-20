"""Backend tests for the report-quota system (iteration_5).

Covers:
- GET /api/plans (trial_10, annual, upcoming agency_starter)
- Fresh user auth/me quota fields
- Quota enforcement (402 on exhaustion)
- Distinct month counting; regeneration is free
- Delete frees the slot
- Admin bypass (unlimited)
- Redeem code increments reports_quota
- Cashfree order creation rejects 'agency_starter'
- Admin users list includes reports_quota
- Regression: /settings/seller GET & PUT admin
"""
import os
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://seller-pnl-pro.preview.emergentagent.com"
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

# ---------- helpers ----------
def _mk_user(is_admin: bool = False, reports_quota: int = 0):
    uid = f"test-quota-{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": uid,
        "email": f"{uid}@example.com",
        "name": "Test Quota User",
        "picture": "",
        "trial_start": now,
        "paid_until": None,
        "is_paid": False,
        "is_admin": is_admin,
        "reports_quota": reports_quota,
        "created_at": now,
    })
    db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": token,
        "expires_at": now + timedelta(days=7),
        "created_at": now,
    })
    return uid, token


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _cleanup(uid):
    db.users.delete_many({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})
    db.reports.delete_many({"user_id": uid})
    db.activation_codes.delete_many({"used_by": uid})


@pytest.fixture
def fresh_user():
    uid, tok = _mk_user(is_admin=False, reports_quota=0)
    yield uid, tok
    _cleanup(uid)


@pytest.fixture
def quota12_user():
    uid, tok = _mk_user(is_admin=False, reports_quota=12)
    yield uid, tok
    _cleanup(uid)


@pytest.fixture
def quota1_user():
    uid, tok = _mk_user(is_admin=False, reports_quota=1)
    yield uid, tok
    _cleanup(uid)


@pytest.fixture
def admin_user():
    uid, tok = _mk_user(is_admin=True, reports_quota=0)
    yield uid, tok
    _cleanup(uid)


# ---------- Tests ----------

# GET /api/plans
def test_plans_shape():
    r = requests.get(f"{API}/plans", timeout=15)
    assert r.status_code == 200
    body = r.json()
    plans = body.get("plans", {})
    upc = body.get("upcoming_plans", {})
    assert plans["trial_10"]["days"] == 7
    assert plans["trial_10"]["reports_quota"] == 1
    assert plans["annual"]["days"] == 365
    assert plans["annual"]["reports_quota"] == 12
    assert "agency_starter" in upc
    ag = upc["agency_starter"]
    assert ag["reports_quota"] == 60
    assert ag["available"] is False
    assert ag["price_inr"] == 1999


# auth/me for fresh user
def test_auth_me_fresh_user(fresh_user):
    uid, tok = fresh_user
    r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    st = r.json()["status"]
    assert st["reports_used"] == 0
    assert st["reports_quota"] == 0
    assert st["reports_remaining"] == 0
    assert st["reports_unlimited"] is False


# POST /api/reports quota=0 → 402
def test_create_report_quota_exhausted(fresh_user):
    uid, tok = fresh_user
    r = requests.post(f"{API}/reports", headers=_hdr(tok),
                      json={"target_month": 1, "target_year": 2026}, timeout=15)
    assert r.status_code == 402
    detail = r.json().get("detail", "").lower()
    assert "quota" in detail


# quota=12 → create Jan 2026 → 200, used=1, remaining=11
def test_create_report_and_regeneration_and_distinct(quota12_user):
    uid, tok = quota12_user
    r = requests.post(f"{API}/reports", headers=_hdr(tok),
                      json={"target_month": 1, "target_year": 2026}, timeout=15)
    assert r.status_code == 200, r.text
    rid1 = r.json()["report_id"]

    me = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
    assert me["reports_used"] == 1
    assert me["reports_remaining"] == 11

    # Regenerate same month (should NOT increment)
    r2 = requests.post(f"{API}/reports", headers=_hdr(tok),
                       json={"target_month": 1, "target_year": 2026}, timeout=15)
    assert r2.status_code == 200
    rid2 = r2.json()["report_id"]
    assert rid1 != rid2  # different doc, same month
    me2 = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
    assert me2["reports_used"] == 1
    assert me2["reports_remaining"] == 11

    # Different month (Feb 2026) → used=2
    r3 = requests.post(f"{API}/reports", headers=_hdr(tok),
                       json={"target_month": 2, "target_year": 2026}, timeout=15)
    assert r3.status_code == 200
    feb_rid = r3.json()["report_id"]
    me3 = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
    assert me3["reports_used"] == 2
    assert me3["reports_remaining"] == 10

    # Delete ALL Feb reports (there could be only one) → back to used=1
    # Actually we only created one Feb report. But delete all Feb docs to be safe.
    feb_docs = list(db.reports.find({"user_id": uid, "target_month": 2, "target_year": 2026}, {"report_id": 1}))
    for d in feb_docs:
        dr = requests.delete(f"{API}/reports/{d['report_id']}", headers=_hdr(tok), timeout=15)
        assert dr.status_code == 200
    me4 = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
    assert me4["reports_used"] == 1


# Quota exhaustion for quota=1 with 1 used distinct month
def test_quota_exhaustion_402(quota1_user):
    uid, tok = quota1_user
    # Use up the single slot
    r = requests.post(f"{API}/reports", headers=_hdr(tok),
                      json={"target_month": 3, "target_year": 2026}, timeout=15)
    assert r.status_code == 200
    # Try a different month
    r2 = requests.post(f"{API}/reports", headers=_hdr(tok),
                       json={"target_month": 4, "target_year": 2026}, timeout=15)
    assert r2.status_code == 402
    assert "quota" in r2.json().get("detail", "").lower()
    # But regen for month 3 must still work
    r3 = requests.post(f"{API}/reports", headers=_hdr(tok),
                       json={"target_month": 3, "target_year": 2026}, timeout=15)
    assert r3.status_code == 200


# Admin bypass
def test_admin_bypass(admin_user):
    uid, tok = admin_user
    me = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
    assert me["reports_unlimited"] is True
    r = requests.post(f"{API}/reports", headers=_hdr(tok),
                      json={"target_month": 5, "target_year": 2026}, timeout=15)
    assert r.status_code == 200


# Redeem code adds annual quota (+12)
def test_redeem_annual_code_adds_quota():
    uid, tok = _mk_user(is_admin=False, reports_quota=5)
    try:
        # Insert an activation code directly
        code = f"SM-TST-{uuid.uuid4().hex[:4].upper()}-{uuid.uuid4().hex[:4].upper()}"
        db.activation_codes.insert_one({
            "code": code, "plan": "annual", "status": "active",
            "used_by": None, "used_by_email": None, "used_at": None,
            "created_at": datetime.now(timezone.utc),
        })
        r = requests.post(f"{API}/codes/redeem", headers=_hdr(tok),
                          json={"code": code}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reports_added"] == 12
        me = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
        assert me["reports_quota"] == 17  # 5 + 12
    finally:
        db.activation_codes.delete_many({"used_by": uid})
        _cleanup(uid)


# Redeem trial_10 code +1
def test_redeem_trial_code_adds_one():
    uid, tok = _mk_user(is_admin=False, reports_quota=0)
    try:
        code = f"SM-TR-{uuid.uuid4().hex[:4].upper()}-{uuid.uuid4().hex[:4].upper()}"
        db.activation_codes.insert_one({
            "code": code, "plan": "trial_10", "status": "active",
            "used_by": None, "used_by_email": None, "used_at": None,
            "created_at": datetime.now(timezone.utc),
        })
        r = requests.post(f"{API}/codes/redeem", headers=_hdr(tok),
                          json={"code": code}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reports_added"] == 1
        me = requests.get(f"{API}/auth/me", headers=_hdr(tok)).json()["status"]
        assert me["reports_quota"] == 1
    finally:
        db.activation_codes.delete_many({"used_by": uid})
        _cleanup(uid)


# Cashfree create-order rejects 'agency_starter'
def test_cf_create_agency_starter_rejected(fresh_user):
    uid, tok = fresh_user
    r = requests.post(f"{API}/payments/cf/create-order", headers=_hdr(tok),
                      json={"plan": "agency_starter"}, timeout=15)
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "unknown plan" in detail


# Admin users includes reports_quota
def test_admin_users_reports_quota_field():
    uid, tok = _mk_user(is_admin=True, reports_quota=0)
    try:
        # create a non-admin with quota
        n_uid, _ = _mk_user(is_admin=False, reports_quota=7)
        try:
            r = requests.get(f"{API}/admin/users", headers=_hdr(tok), timeout=15)
            assert r.status_code == 200
            users = r.json()["users"]
            match = [u for u in users if u.get("user_id") == n_uid]
            assert len(match) == 1
            assert "reports_quota" in match[0]
            assert match[0]["reports_quota"] == 7
        finally:
            _cleanup(n_uid)
    finally:
        _cleanup(uid)


# Regression: /settings/seller GET & PUT admin
def test_public_seller_settings():
    r = requests.get(f"{API}/settings/seller", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "seller" in body
    assert "business_name" in body["seller"]


def test_admin_get_put_seller_settings():
    uid, tok = _mk_user(is_admin=True, reports_quota=0)
    try:
        rg = requests.get(f"{API}/admin/settings/seller", headers=_hdr(tok), timeout=15)
        assert rg.status_code == 200
        s = rg.json()["seller"]
        payload = {
            "business_name": s.get("business_name") or "Seller Margin",
            "gstin": s.get("gstin") or "27AAAAA0000A1Z5",
            "pan": s.get("pan") or "",
            "address_line1": s.get("address_line1") or "L1",
            "address_line2": s.get("address_line2") or "",
            "state": s.get("state") or "Maharashtra",
            "state_code": s.get("state_code") or "27",
            "contact_email": s.get("contact_email") or "a@b.com",
            "phone": s.get("phone") or "",
            "website": s.get("website") or "",
            "sac_code": s.get("sac_code") or "998314",
            "hsn_description": s.get("hsn_description") or "",
        }
        rp = requests.put(f"{API}/admin/settings/seller", headers=_hdr(tok),
                          json=payload, timeout=15)
        assert rp.status_code == 200, rp.text
        assert rp.json()["ok"] is True
    finally:
        _cleanup(uid)
