"""End-to-end backend tests for Amazon P&L SaaS."""
import os, io, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://seller-pnl-pro.preview.emergentagent.com").rstrip("/")
SAMPLE_DIR = "/app/tmp/samples"
QA_TOKEN = "qa_session_token_123"
ADMIN_TOKEN = "admin_session_token_123"

def H(tok): return {"Authorization": f"Bearer {tok}"}

@pytest.fixture(scope="session")
def report_id():
    r = requests.post(f"{BASE}/api/reports", json={"target_month": 6, "target_year": 2025, "name": "TEST_PNL_Jun2025"}, headers=H(QA_TOKEN))
    assert r.status_code == 200, r.text
    return r.json()["report_id"]

# --- Health ---
def test_health():
    r = requests.get(f"{BASE}/api/")
    assert r.status_code == 200
    assert "message" in r.json()

# --- Auth ---
def test_me_unauthenticated():
    r = requests.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401

def test_me_with_token():
    r = requests.get(f"{BASE}/api/auth/me", headers=H(QA_TOKEN))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user_id"] == "test-user-qa"
    assert d["status"]["has_access"] is True
    assert 13 <= d["status"]["trial_days_left"] <= 15

# --- Report CRUD ---
def test_create_and_list_report(report_id):
    r = requests.get(f"{BASE}/api/reports", headers=H(QA_TOKEN))
    assert r.status_code == 200
    ids = [x["report_id"] for x in r.json()["reports"]]
    assert report_id in ids

    r = requests.get(f"{BASE}/api/reports/{report_id}", headers=H(QA_TOKEN))
    assert r.status_code == 200
    assert r.json()["target_month"] == 6

# --- Uploads (auto-detect) ---
UPLOAD_MAP = [
    ("orders.txt", "orders"),
    ("payment.csv", "payment"),
    ("fba_returns.csv", "fba_returns"),
    ("easyship_returns.tsv", "easyship_returns"),
    ("fba_removal.csv", "fba_removal"),
    ("ad_spend.csv", "ad_spend"),
]

@pytest.mark.parametrize("fname,expected", UPLOAD_MAP)
def test_upload_autodetect(report_id, fname, expected):
    with open(os.path.join(SAMPLE_DIR, fname), "rb") as f:
        r = requests.post(
            f"{BASE}/api/reports/{report_id}/upload",
            headers=H(QA_TOKEN),
            files={"file": (fname, f, "application/octet-stream")},
        )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["detected_type"] == expected, f"expected {expected}, got {d}"
    assert d["rows"] > 0

# --- Build ---
def test_build(report_id):
    r = requests.post(f"{BASE}/api/reports/{report_id}/build", headers=H(QA_TOKEN))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["rows_count"] >= 60, d
    assert isinstance(d["skus"], list) and len(d["skus"]) > 0
    assert "missing_costs" in d

# --- Cost prices ---
def test_set_costs_and_library(report_id):
    # Get skus from build
    rows = requests.get(f"{BASE}/api/reports/{report_id}/rows", headers=H(QA_TOKEN)).json()["rows"]
    skus = sorted({row["sku"] for row in rows if row.get("sku")})
    costs = [{"sku": s, "cost_price": 100.0, "product_name": s} for s in skus]
    r = requests.post(f"{BASE}/api/reports/{report_id}/costs", json={"costs": costs}, headers=H(QA_TOKEN))
    assert r.status_code == 200, r.text
    assert r.json()["updated"] == len(skus)
    lib = requests.get(f"{BASE}/api/cost-prices", headers=H(QA_TOKEN))
    assert lib.status_code == 200
    assert len(lib.json()["cost_prices"]) >= len(skus)

# --- Returns list + overrides ---
def test_returns_and_overrides(report_id):
    r = requests.get(f"{BASE}/api/reports/{report_id}/returns", headers=H(QA_TOKEN))
    assert r.status_code == 200
    entries = r.json()["returns"]
    # optional: some returns exist in sample
    if entries:
        e0 = entries[0]
        assert ("product_condition" in e0) or ("return_reason" in e0)
        payload = [{"order_id": e0["order_id"], "cost_price_unit_override": 55.5}]
        r2 = requests.post(f"{BASE}/api/reports/{report_id}/return-overrides", json=payload, headers=H(QA_TOKEN))
        assert r2.status_code == 200

# --- Finalize ---
def test_finalize(report_id):
    r = requests.post(f"{BASE}/api/reports/{report_id}/finalize", headers=H(QA_TOKEN))
    assert r.status_code == 200, r.text
    s = r.json()["summary"]
    needed = ["settlement","reimbursement","total_received","cogs","inbound_fee","storage_fee","removal_fee",
              "ad_spend","total_deduction","final_profit","acos_pct","profit_pct","profit_pct_on_cogs",
              "return_pct","total_item_price","orders_count","returns_count"]
    for k in needed:
        assert k in s, f"missing {k}"
        v = s[k]
        if isinstance(v, (int, float)):
            assert v == v and v not in (float("inf"), float("-inf")), f"{k} not finite: {v}"
    # Expected values (approximate) per problem statement
    assert abs(s["ad_spend"] - 7979.87) < 5, s["ad_spend"]
    assert abs(s["removal_fee"] - 82.60) < 5, s["removal_fee"]
    assert abs(s["settlement"] - 38612) < 50, s["settlement"]
    assert s["final_profit"] > 0

# --- Exports ---
def test_export_xlsx(report_id):
    r = requests.get(f"{BASE}/api/reports/{report_id}/export.xlsx", headers=H(QA_TOKEN))
    assert r.status_code == 200
    assert r.content[:2] == b"PK"

def test_export_pdf(report_id):
    r = requests.get(f"{BASE}/api/reports/{report_id}/export.pdf", headers=H(QA_TOKEN))
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"

# --- Payments ---
def test_plan():
    r = requests.get(f"{BASE}/api/plan")
    assert r.status_code == 200
    p = r.json()["package"]
    assert p["id"] == "lifetime"

def test_checkout():
    r = requests.post(f"{BASE}/api/payments/checkout",
                      json={"origin_url": "https://seller-pnl-pro.preview.emergentagent.com"},
                      headers=H(QA_TOKEN))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("checkout_url", "").startswith("http")
    assert d.get("session_id")

# --- Admin gating ---
def test_admin_forbidden_for_regular_user():
    r = requests.get(f"{BASE}/api/admin/stats", headers=H(QA_TOKEN))
    assert r.status_code == 403

def test_admin_allowed_for_admin():
    r = requests.get(f"{BASE}/api/admin/stats", headers=H(ADMIN_TOKEN))
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["total_users","paid_users","trial_users","total_reports","revenue_usd"]:
        assert k in d
