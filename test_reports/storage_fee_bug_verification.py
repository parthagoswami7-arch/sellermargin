#!/usr/bin/env python3
"""Focused verification for storage fee month filtering bug."""
from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


APP_DIR = Path("/app")
BACKEND_DIR = APP_DIR / "backend"
SAMPLES_DIR = APP_DIR / "tmp" / "samples"
API_BASE = os.environ.get("TEST_API_BASE", "https://seller-pnl-pro.preview.emergentagent.com/api")

sys.path.insert(0, str(BACKEND_DIR))


def direct_engine_test() -> dict:
    from pnl_engine import compute_summary

    payment = [
        {"description": "FBA storage fee", "total": "-539.93", "date/time": "7 Feb 2026 1:00:00 am UTC"},
        {"description": "FBA storage fee", "total": "-529.91", "date/time": "7 Mar 2026 1:00:00 am UTC"},
        {"description": "FBA storage fee", "total": "-539.93", "date/time": "7 Apr 2026 1:00:00 am UTC"},
    ]
    summary = compute_summary(rows=[], payment=payment, fba_removal=[], ad_spend=[], target_month=2, target_year=2026)
    actual = summary.get("storage_fee")
    return {
        "name": "direct_engine_compute_summary_storage_fee_next_month_only",
        "passed": actual == 529.91,
        "expected_storage_fee": 529.91,
        "actual_storage_fee": actual,
        "summary_subset": {"storage_fee": actual, "target_month": summary.get("target_month"), "target_year": summary.get("target_year")},
    }


def load_backend_env() -> dict:
    env = {}
    env_path = BACKEND_DIR / ".env"
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def create_test_session() -> dict:
    from pymongo import MongoClient

    env = load_backend_env()
    mongo_url = env.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = env.get("DB_NAME", "test_database")
    client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    db = client[db_name]
    suffix = uuid.uuid4().hex[:10]
    user_id = f"storage-fee-test-{suffix}"
    token = f"test_session_storage_fee_{suffix}"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": user_id,
        "email": f"storage-fee-{suffix}@example.com",
        "name": "Storage Fee QA",
        "picture": "",
        "trial_start": now,
        "is_paid": False,
        "is_admin": False,
        "created_at": now,
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": now + timedelta(days=7),
        "created_at": now,
    })
    return {"user_id": user_id, "token": token, "mongo_url": mongo_url, "db_name": db_name}


def api_request(method: str, path: str, token: str, **kwargs) -> requests.Response:
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {token}"
    response = requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=60, **kwargs)
    return response


def assert_response(response: requests.Response, step: str) -> dict:
    try:
        body = response.json()
    except Exception:
        body = response.text[:1000]
    result = {"step": step, "status_code": response.status_code, "body": body}
    if response.status_code >= 400:
        raise AssertionError(json.dumps(result, default=str))
    return result


def api_e2e_test() -> dict:
    session = create_test_session()
    token = session["token"]
    steps = []
    rid = None
    try:
        # Confirm auth token works against the public API before starting the report flow.
        steps.append(assert_response(api_request("GET", "/auth/me", token), "auth_me"))

        create_resp = api_request("POST", "/reports", token, json={"target_month": 2, "target_year": 2026, "name": "Storage fee QA Feb 2026"})
        create_data = assert_response(create_resp, "create_report")
        steps.append(create_data)
        rid = create_data["body"]["report_id"]

        uploaded = []
        for path in sorted(SAMPLES_DIR.glob("*")):
            with path.open("rb") as fh:
                resp = api_request("POST", f"/reports/{rid}/upload", token, files={"file": (path.name, fh, "application/octet-stream")})
            data = assert_response(resp, f"upload_{path.name}")
            uploaded.append({"file": path.name, "detected_type": data["body"].get("detected_type"), "rows": data["body"].get("rows")})
        steps.append({"step": "upload_all_samples", "uploaded": uploaded})

        build_data = assert_response(api_request("POST", f"/reports/{rid}/build", token), "build_report")
        steps.append(build_data)
        skus = [item["sku"] for item in build_data["body"].get("skus", []) if item.get("sku")]
        costs_payload = {"costs": [{"sku": sku, "cost_price": 100, "product_name": ""} for sku in skus]}
        costs_data = assert_response(api_request("POST", f"/reports/{rid}/costs", token, json=costs_payload), "seed_report_costs_100")
        steps.append({"step": "seed_report_costs_100", "status_code": costs_data["status_code"], "updated": costs_data["body"].get("updated"), "sku_count": len(skus)})

        finalize_data = assert_response(api_request("POST", f"/reports/{rid}/finalize", token), "finalize_report")
        summary = finalize_data["body"].get("summary", {})
        actual = summary.get("storage_fee")
        steps.append({"step": "finalize_report", "status_code": finalize_data["status_code"], "storage_fee": actual})
        return {
            "name": "api_e2e_storage_fee_feb_2026_samples",
            "passed": actual == 529.91,
            "expected_storage_fee": 529.91,
            "actual_storage_fee": actual,
            "report_id": rid,
            "api_base": API_BASE,
            "session": {"user_id": session["user_id"], "db_name": session["db_name"]},
            "steps": steps,
            "summary": summary,
        }
    except Exception as exc:
        return {
            "name": "api_e2e_storage_fee_feb_2026_samples",
            "passed": False,
            "expected_storage_fee": 529.91,
            "actual_storage_fee": None,
            "report_id": rid,
            "api_base": API_BASE,
            "session": {"user_id": session["user_id"], "db_name": session["db_name"]},
            "steps": steps,
            "error": str(exc),
        }


def main() -> int:
    results = {
        "direct_engine": direct_engine_test(),
        "api_e2e": api_e2e_test(),
    }
    results["passed"] = bool(results["direct_engine"].get("passed") and results["api_e2e"].get("passed"))
    print(json.dumps(results, indent=2, default=str))
    return 0 if results["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())