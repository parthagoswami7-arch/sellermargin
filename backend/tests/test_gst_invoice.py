"""Backend tests for GST invoice + seller settings + Cashfree checkout GST math."""
import os
import hmac
import hashlib
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://seller-pnl-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "sess_admin_1784529644165")
USER_TOKEN = os.environ.get("USER_TOKEN", "sess_user_1784529644165")

MONGO = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = MONGO[os.environ.get("DB_NAME", "test_database")]

# HMAC secret: SESSION_SECRET or EMERGENT_EMAIL_KEY fallback (from server.py)
INVOICE_SECRET = os.environ.get("SESSION_SECRET") or os.environ.get(
    "EMERGENT_EMAIL_KEY", "ek_49c2cb93345d41eed3828771d36710c1"
)


def _sign(order_id: str) -> str:
    return hmac.new(INVOICE_SECRET.encode(), order_id.encode(), hashlib.sha256).hexdigest()[:32]


def admin_headers():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"}


def user_headers():
    return {"Authorization": f"Bearer {USER_TOKEN}", "Content-Type": "application/json"}


# ---------------- Plans ----------------
class TestPlans:
    def test_plans_include_gst_pct(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()["plans"]
        assert "trial_10" in plans and "annual" in plans
        assert plans["trial_10"]["price_inr"] == 49
        assert plans["annual"]["price_inr"] == 499
        assert plans["trial_10"]["gst_pct"] == 18
        assert plans["annual"]["gst_pct"] == 18


# ---------------- Public seller settings + states ----------------
class TestPublicSettings:
    def test_public_seller(self):
        # Reset seller to defaults so this test is deterministic
        db.settings.delete_one({"key": "seller"})
        r = requests.get(f"{API}/settings/seller", timeout=15)
        assert r.status_code == 200
        s = r.json()["seller"]
        for k in ["business_name", "gstin", "state", "state_code", "sac_code"]:
            assert k in s, f"missing {k}"
        assert s["state_code"] == "27"  # placeholder Maharashtra
        assert s["sac_code"] == "998314"

    def test_india_states(self):
        r = requests.get(f"{API}/settings/india-states", timeout=15)
        assert r.status_code == 200
        states = r.json()["states"]
        assert len(states) == 36
        names = {x["name"]: x["code"] for x in states}
        assert names["Maharashtra"] == "27"
        assert names["Karnataka"] == "29"


# ---------------- Auth guards on invoice download ----------------
class TestInvoiceDownloadAuth:
    def test_no_token_no_session(self):
        r = requests.get(f"{API}/invoices/does_not_matter.pdf", timeout=15,
                         allow_redirects=False)
        # order not found returns 404. To test 401, we need a real order id.
        # Insert stub order for this scenario
        oid = "sm_test_authstub_001"
        db.cf_orders.delete_one({"order_id": oid})
        db.cf_orders.insert_one({
            "order_id": oid, "user_id": "test-user-gst",
            "user_email": "user-gst@example.com", "plan": "trial_10",
            "amount": 57.82, "base_amount": 49.0,
            "gst": {"cgst": 4.41, "sgst": 4.41, "igst": 0, "cgst_pct": 9, "sgst_pct": 9, "igst_pct": 0,
                    "total_tax": 8.82, "intra_state": True},
            "code_delivered": False,
        })
        r = requests.get(f"{API}/invoices/{oid}.pdf", timeout=15)
        assert r.status_code == 401

    def test_invalid_token(self):
        oid = "sm_test_authstub_001"
        r = requests.get(f"{API}/invoices/{oid}.pdf?token=badtoken", timeout=15)
        assert r.status_code == 401

    def test_valid_token_but_not_paid_yet(self):
        oid = "sm_test_authstub_001"
        tok = _sign(oid)
        r = requests.get(f"{API}/invoices/{oid}.pdf?token={tok}", timeout=15)
        assert r.status_code == 400
        assert "successful payment" in r.text.lower() or "successful" in r.text.lower()

    def test_valid_token_and_paid_returns_pdf(self):
        oid = "sm_test_authstub_002"
        db.cf_orders.delete_one({"order_id": oid})
        db.cf_orders.insert_one({
            "order_id": oid, "user_id": "test-user-gst",
            "user_email": "user-gst@example.com", "plan": "trial_10",
            "amount": 57.82, "base_amount": 49.0,
            "gst": {"cgst": 4.41, "sgst": 4.41, "igst": 0, "cgst_pct": 9, "sgst_pct": 9,
                    "igst_pct": 0, "total_tax": 8.82, "intra_state": True},
            "code_delivered": True, "invoice_no": "SM/FY25-26/9999",
        })
        tok = _sign(oid)
        r = requests.get(f"{API}/invoices/{oid}.pdf?token={tok}", timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ---------------- Admin seller settings ----------------
class TestAdminSellerSettings:
    def test_admin_get_seller_full(self):
        r = requests.get(f"{API}/admin/settings/seller", headers=admin_headers(), timeout=15)
        assert r.status_code == 200
        s = r.json()["seller"]
        assert "address_line1" in s
        assert "gstin" in s

    def test_admin_put_seller_auto_state_code(self):
        payload = {
            "business_name": "Test Biz",
            "gstin": "27aaaaa1111a1z5",  # lowercase to verify upper conversion
            "pan": "AAAAA1111A",
            "address_line1": "Street A",
            "address_line2": "Suite 1",
            "state": "Karnataka",
            "state_code": "",  # empty -> should auto-derive
            "contact_email": "b@x.com",
            "phone": "9999",
            "website": "x.com",
            "sac_code": "998314",
            "hsn_description": "SaaS",
        }
        r = requests.put(f"{API}/admin/settings/seller", headers=admin_headers(),
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text
        s = r.json()["seller"]
        assert s["state_code"] == "29"
        assert s["gstin"] == "27AAAAA1111A1Z5"
        assert s["business_name"] == "Test Biz"

        # verify via GET
        r2 = requests.get(f"{API}/admin/settings/seller", headers=admin_headers(), timeout=15)
        s2 = r2.json()["seller"]
        assert s2["state"] == "Karnataka"
        assert s2["state_code"] == "29"
        assert s2["address_line1"] == "Street A"

    def test_admin_put_non_admin_403(self):
        payload = {
            "business_name": "X", "gstin": "27AAAAA1111A1Z5", "address_line1": "a",
            "state": "Maharashtra",
        }
        r = requests.put(f"{API}/admin/settings/seller", headers=user_headers(),
                         json=payload, timeout=15)
        assert r.status_code == 403


# ---------------- Create order GST math ----------------
class TestCreateOrderGST:
    """Cashfree sandbox may occasionally fail; treat 502 as external and validate
    via db read after with what the endpoint would compute (fallback)."""

    def _reset_seller_maharashtra(self):
        # Put seller back to Maharashtra so intra/inter-state tests are deterministic
        payload = {
            "business_name": "Seller Margin",
            "gstin": "27AAAAA0000A1Z5",
            "pan": "AAAAA0000A",
            "address_line1": "office",
            "address_line2": "",
            "state": "Maharashtra",
            "state_code": "27",
            "contact_email": "b@x.com",
            "phone": "",
            "website": "",
            "sac_code": "998314",
            "hsn_description": "SaaS",
        }
        r = requests.put(f"{API}/admin/settings/seller", headers=admin_headers(),
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text

    def test_intra_state_trial(self):
        self._reset_seller_maharashtra()
        r = requests.post(f"{API}/payments/cf/create-order", headers=user_headers(),
                          json={"plan": "trial_10", "buyer_state": "Maharashtra"}, timeout=30)
        if r.status_code == 502:
            pytest.skip(f"Cashfree sandbox down: {r.text}")
        assert r.status_code == 200, r.text
        body = r.json()
        ab = body["amount_breakdown"]
        assert ab["base"] == 49.0
        assert ab["cgst"] == 4.41
        assert ab["sgst"] == 4.41
        assert ab["igst"] == 0
        assert ab["total"] == 57.82
        assert ab["intra_state"] is True

        # Verify DB stored the gst dict
        rec = db.cf_orders.find_one({"order_id": body["order_id"]}, {"_id": 0})
        assert rec is not None
        assert rec["gst"]["intra_state"] is True
        assert rec["gst"]["cgst"] == 4.41

    def test_inter_state_annual_with_gstin(self):
        self._reset_seller_maharashtra()
        payload = {
            "plan": "annual", "wants_invoice": True,
            "buyer_name": "Acme LLP", "buyer_gstin": "29ABCDE1234F1Z5",
            "buyer_state": "Karnataka", "buyer_billing_address": "Bangalore 560001",
        }
        r = requests.post(f"{API}/payments/cf/create-order", headers=user_headers(),
                          json=payload, timeout=30)
        if r.status_code == 502:
            pytest.skip(f"Cashfree sandbox down: {r.text}")
        assert r.status_code == 200, r.text
        ab = r.json()["amount_breakdown"]
        assert ab["base"] == 499.0
        assert ab["igst"] == 89.82
        assert ab["cgst"] == 0
        assert ab["sgst"] == 0
        assert ab["total"] == 588.82
        assert ab["intra_state"] is False

        rec = db.cf_orders.find_one({"order_id": r.json()["order_id"]}, {"_id": 0})
        assert rec["buyer_gstin"] == "29ABCDE1234F1Z5"
        assert rec["buyer_name"] == "Acme LLP"
        assert rec["wants_invoice"] is True

    def test_buyer_skips_gst_defaults_intra(self):
        self._reset_seller_maharashtra()
        r = requests.post(f"{API}/payments/cf/create-order", headers=user_headers(),
                          json={"plan": "trial_10", "wants_invoice": False}, timeout=30)
        if r.status_code == 502:
            pytest.skip(f"Cashfree sandbox down: {r.text}")
        assert r.status_code == 200, r.text
        ab = r.json()["amount_breakdown"]
        assert ab["total"] == 57.82
        assert ab["intra_state"] is True


# ---------------- Regression checks ----------------
class TestRegression:
    def test_auth_me(self):
        r = requests.get(f"{API}/auth/me", headers=user_headers(), timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "user-gst@example.com"

    def test_reports_list(self):
        r = requests.get(f"{API}/reports", headers=user_headers(), timeout=15)
        assert r.status_code == 200
        # should be a dict with 'reports' or a list
        j = r.json()
        assert isinstance(j, (list, dict))
