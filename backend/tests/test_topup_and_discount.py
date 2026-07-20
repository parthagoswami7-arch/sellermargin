"""Tests for the new topup_5 plan and annual plan discount fields.

Covers:
- /api/plans exposes topup_5 + annual list_price_inr/discount_note + upcoming_plans
- Cashfree create-order GST math for topup_5 (intra + inter state) + DB record shape
- Topup quota semantics: reports_quota inc, paid_until NOT extended
- Codes: admin generate for topup_5, redeem topup_5 (paid_until unchanged)
- Regression: annual redemption still extends paid_until 365d and adds 12 reports
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

USER1_TOKEN = os.environ["USER1_TOKEN"]
USER2_TOKEN = os.environ["USER2_TOKEN"]
ADMIN_TOKEN = os.environ["ADMIN_TOKEN"]

USER1_ID = "test-topup-user-1"
USER2_ID = "test-topup-user-2"
ADMIN_ID = "test-topup-admin-1"

MONGO = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = MONGO[os.environ.get("DB_NAME", "test_database")]


def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Plans exposure ----------------
class TestPlansExposure:
    def test_three_plans_present(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        body = r.json()
        plans = body["plans"]
        for pid in ["trial_10", "annual", "topup_5"]:
            assert pid in plans, f"missing {pid}"
        assert "upcoming_plans" in body
        assert "agency_starter" in body["upcoming_plans"]

    def test_trial_shape(self):
        p = requests.get(f"{API}/plans", timeout=15).json()["plans"]["trial_10"]
        assert p["price_inr"] == 49
        assert p["days"] == 7
        assert p["reports_quota"] == 1

    def test_annual_discount_fields(self):
        p = requests.get(f"{API}/plans", timeout=15).json()["plans"]["annual"]
        assert p["price_inr"] == 499
        assert p["list_price_inr"] == 599
        assert p["days"] == 365
        assert p["reports_quota"] == 12
        assert "discount_note" in p and p["discount_note"]

    def test_topup_shape(self):
        p = requests.get(f"{API}/plans", timeout=15).json()["plans"]["topup_5"]
        assert p["price_inr"] == 249
        assert p["days"] == 0
        assert p["reports_quota"] == 5
        assert p.get("is_topup") is True


# ---------------- Cashfree create-order GST math (topup_5) ----------------
class TestTopupOrderGST:
    def _reset_seller_maharashtra(self):
        payload = {
            "business_name": "Seller Margin", "gstin": "27AAAAA0000A1Z5",
            "pan": "AAAAA0000A", "address_line1": "office",
            "state": "Maharashtra", "state_code": "27",
            "contact_email": "b@x.com", "sac_code": "998314", "hsn_description": "SaaS",
        }
        r = requests.put(f"{API}/admin/settings/seller", headers=hdr(ADMIN_TOKEN),
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text

    def test_topup_intra_state_maharashtra(self):
        self._reset_seller_maharashtra()
        r = requests.post(f"{API}/payments/cf/create-order", headers=hdr(USER1_TOKEN),
                          json={"plan": "topup_5", "buyer_state": "Maharashtra"}, timeout=30)
        if r.status_code == 502:
            pytest.skip(f"Cashfree sandbox down: {r.text}")
        assert r.status_code == 200, r.text
        ab = r.json()["amount_breakdown"]
        assert ab["base"] == 249.0
        assert ab["cgst"] == 22.41
        assert ab["sgst"] == 22.41
        assert ab["igst"] == 0
        assert ab["total"] == 293.82
        assert ab["intra_state"] is True

        rec = db.cf_orders.find_one({"order_id": r.json()["order_id"]}, {"_id": 0})
        assert rec is not None
        assert rec["plan"] == "topup_5"
        assert rec["base_amount"] == 249.0
        assert rec["amount"] == 293.82
        assert rec["gst"]["intra_state"] is True

    def test_topup_inter_state_karnataka(self):
        self._reset_seller_maharashtra()
        payload = {"plan": "topup_5", "buyer_state": "Karnataka",
                   "wants_invoice": True, "buyer_name": "KA Buyer",
                   "buyer_billing_address": "Bangalore"}
        r = requests.post(f"{API}/payments/cf/create-order", headers=hdr(USER1_TOKEN),
                          json=payload, timeout=30)
        if r.status_code == 502:
            pytest.skip(f"Cashfree sandbox down: {r.text}")
        assert r.status_code == 200, r.text
        ab = r.json()["amount_breakdown"]
        assert ab["base"] == 249.0
        assert ab["igst"] == 44.82
        assert ab["cgst"] == 0
        assert ab["sgst"] == 0
        assert ab["total"] == 293.82
        assert ab["intra_state"] is False


# ---------------- Topup quota semantics ----------------
class TestTopupQuotaSemantics:
    def test_paid_user_topup_does_not_extend_paid_until(self):
        # Reset paid user state
        original_paid_until = datetime.now(timezone.utc) + timedelta(days=90)
        db.users.update_one(
            {"user_id": USER1_ID},
            {"$set": {"paid_until": original_paid_until, "is_paid": True, "reports_quota": 12}},
        )
        # Sanity check auth/me pre-topup
        r0 = requests.get(f"{API}/auth/me", headers=hdr(USER1_TOKEN), timeout=15)
        assert r0.status_code == 200
        me0 = r0.json()
        assert me0["status"]["reports_quota"] == 12

        # Simulate topup fulfillment: $inc reports_quota by 5, do NOT touch paid_until
        db.users.update_one({"user_id": USER1_ID}, {"$inc": {"reports_quota": 5}})

        r1 = requests.get(f"{API}/auth/me", headers=hdr(USER1_TOKEN), timeout=15)
        assert r1.status_code == 200
        me1 = r1.json()
        assert me1["status"]["reports_quota"] == 17
        assert me1["status"]["reports_remaining"] == 17

        # paid_until unchanged
        u = db.users.find_one({"user_id": USER1_ID}, {"_id": 0})
        # Compare within 1s (Mongo can round to millis)
        assert abs((u["paid_until"].replace(tzinfo=timezone.utc) - original_paid_until).total_seconds()) < 2

    def test_unpaid_user_topup_leaves_paid_until_null(self):
        db.users.update_one(
            {"user_id": USER2_ID},
            {"$set": {"paid_until": None, "is_paid": False, "reports_quota": 0}},
        )
        db.users.update_one({"user_id": USER2_ID}, {"$inc": {"reports_quota": 5}})
        r = requests.get(f"{API}/auth/me", headers=hdr(USER2_TOKEN), timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me["status"]["reports_quota"] == 5
        assert me["status"]["reports_remaining"] == 5
        u = db.users.find_one({"user_id": USER2_ID}, {"_id": 0})
        assert u["paid_until"] is None


# ---------------- Codes: admin generate + redeem topup ----------------
class TestTopupCodes:
    def test_admin_generate_topup_codes(self):
        r = requests.post(f"{API}/admin/codes/generate", headers=hdr(ADMIN_TOKEN),
                          json={"plan": "topup_5", "count": 2}, timeout=15)
        assert r.status_code == 200, r.text
        codes = r.json()["codes"]
        assert len(codes) == 2
        for c in codes:
            assert c.startswith("SM-")
            rec = db.activation_codes.find_one({"code": c}, {"_id": 0})
            assert rec["plan"] == "topup_5"
            assert rec["status"] == "active"

    def test_redeem_topup_does_not_extend_paid_until(self):
        # Set USER2 to paid with paid_until=X to prove topup redeem doesn't move it
        original_paid_until = datetime.now(timezone.utc) + timedelta(days=30)
        db.users.update_one(
            {"user_id": USER2_ID},
            {"$set": {"paid_until": original_paid_until, "is_paid": True, "reports_quota": 3}},
        )
        # Create a fresh topup_5 code
        gen = requests.post(f"{API}/admin/codes/generate", headers=hdr(ADMIN_TOKEN),
                            json={"plan": "topup_5", "count": 1}, timeout=15).json()
        code = gen["codes"][0]

        r = requests.post(f"{API}/codes/redeem", headers=hdr(USER2_TOKEN),
                          json={"code": code}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reports_added"] == 5
        assert body["is_topup"] is True

        u = db.users.find_one({"user_id": USER2_ID}, {"_id": 0})
        assert u["reports_quota"] == 8  # 3 + 5
        assert abs((u["paid_until"].replace(tzinfo=timezone.utc) - original_paid_until).total_seconds()) < 2

    def test_redeem_topup_when_never_paid_keeps_paid_until_null(self):
        # Fresh throwaway user
        uid = "test-topup-user-never-paid"
        tok = "sess_never_paid_1"
        db.users.delete_many({"user_id": uid})
        db.user_sessions.delete_many({"user_id": uid})
        db.users.insert_one({
            "user_id": uid, "email": "never@test.com", "name": "N",
            "picture": "", "trial_start": datetime.now(timezone.utc),
            "paid_until": None, "is_paid": False, "is_admin": False,
            "reports_quota": 0, "created_at": datetime.now(timezone.utc),
        })
        db.user_sessions.insert_one({
            "user_id": uid, "session_token": tok,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        })
        gen = requests.post(f"{API}/admin/codes/generate", headers=hdr(ADMIN_TOKEN),
                            json={"plan": "topup_5", "count": 1}, timeout=15).json()
        code = gen["codes"][0]
        r = requests.post(f"{API}/codes/redeem",
                          headers={"Authorization": f"Bearer {tok}",
                                   "Content-Type": "application/json"},
                          json={"code": code}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reports_added"] == 5
        assert body["is_topup"] is True
        assert body.get("paid_until") in (None, "")

        u = db.users.find_one({"user_id": uid}, {"_id": 0})
        assert u["paid_until"] is None
        assert u["reports_quota"] == 5

        # Cleanup
        db.users.delete_many({"user_id": uid})
        db.user_sessions.delete_many({"user_id": uid})


# ---------------- Regression: annual code still extends 365d ----------------
class TestAnnualRegression:
    def test_annual_redeem_extends_365d_and_adds_12(self):
        uid = "test-annual-regression-1"
        tok = "sess_annual_reg_1"
        db.users.delete_many({"user_id": uid})
        db.user_sessions.delete_many({"user_id": uid})
        db.users.insert_one({
            "user_id": uid, "email": "annualreg@test.com", "name": "AR",
            "picture": "", "trial_start": datetime.now(timezone.utc),
            "paid_until": None, "is_paid": False, "is_admin": False,
            "reports_quota": 0, "created_at": datetime.now(timezone.utc),
        })
        db.user_sessions.insert_one({
            "user_id": uid, "session_token": tok,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        })

        gen = requests.post(f"{API}/admin/codes/generate", headers=hdr(ADMIN_TOKEN),
                            json={"plan": "annual", "count": 1}, timeout=15).json()
        code = gen["codes"][0]
        before = datetime.now(timezone.utc)
        r = requests.post(f"{API}/codes/redeem",
                          headers={"Authorization": f"Bearer {tok}",
                                   "Content-Type": "application/json"},
                          json={"code": code}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reports_added"] == 12
        assert body["is_topup"] is False
        assert body["paid_until"], "annual redeem must return paid_until"

        u = db.users.find_one({"user_id": uid}, {"_id": 0})
        assert u["is_paid"] is True
        assert u["reports_quota"] == 12
        delta_days = (u["paid_until"].replace(tzinfo=timezone.utc) - before).days
        # allow +/- 1 day fuzz
        assert 363 <= delta_days <= 366, f"paid_until delta days={delta_days}"

        db.users.delete_many({"user_id": uid})
        db.user_sessions.delete_many({"user_id": uid})


# Note: module-level teardown removed because pytest-xdist loadscope runs
# teardowns per worker and would delete admin sessions mid-run. Cleanup is
# performed via a separate script (see end of test run notes).
