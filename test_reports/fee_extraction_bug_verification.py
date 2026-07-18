
#!/usr/bin/env python3
"""Focused verification for Payment CSV-derived fee extraction bug.

Tests:
1) Full backend API flow with sample uploads (no fba_removal upload) through finalize.
2) Direct compute_summary with renamed Payment columns (Posted Date/Description/Amount).

No product code is modified by this script. It creates an isolated Mongo user/session and report.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from pymongo import MongoClient

APP = Path('/app')
BACKEND = APP / 'backend'
SAMPLES = APP / 'tmp' / 'samples'
API_BASE = os.environ.get('API_BASE', 'https://seller-pnl-pro.preview.emergentagent.com/api')

sys.path.insert(0, str(BACKEND))
from pnl_engine import compute_summary  # noqa: E402


def read_backend_env() -> dict[str, str]:
    env = {}
    env_path = BACKEND / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"').strip("'")
    return env


def approx(actual: Any, expected: float, tol: float = 0.02) -> bool:
    try:
        return abs(float(actual) - expected) <= tol
    except Exception:
        return False


def require(cond: bool, message: str):
    if not cond:
        raise AssertionError(message)


def create_session() -> tuple[str, str]:
    env = read_backend_env()
    mongo_url = env.get('MONGO_URL') or os.environ.get('MONGO_URL')
    db_name = env.get('DB_NAME') or os.environ.get('DB_NAME') or 'test_database'
    require(bool(mongo_url), 'MONGO_URL not available')
    token = f"fee-bug-test-{int(time.time())}"
    user_id = f"fee-bug-user-{int(time.time())}"
    email = f"fee-bug-{int(time.time())}@example.com"
    client = MongoClient(mongo_url)
    db = client[db_name]
    db.users.insert_one({
        'user_id': user_id,
        'email': email,
        'name': 'Fee Bug QA',
        'picture': '',
        'trial_start': datetime.now(timezone.utc),
        'is_paid': False,
        'is_admin': False,
        'created_at': datetime.now(timezone.utc),
    })
    db.user_sessions.insert_one({
        'user_id': user_id,
        'session_token': token,
        'expires_at': datetime.now(timezone.utc) + timedelta(days=7),
        'created_at': datetime.now(timezone.utc),
    })
    client.close()
    return token, user_id


def api_request(method: str, path: str, token: str, **kwargs) -> requests.Response:
    headers = kwargs.pop('headers', {})
    headers['Authorization'] = f'Bearer {token}'
    resp = requests.request(method, f"{API_BASE}{path}", headers=headers, timeout=60, **kwargs)
    if resp.status_code >= 400:
        raise AssertionError(f"{method} {path} failed HTTP {resp.status_code}: {resp.text[:1000]}")
    return resp


def test_full_api_flow(token: str) -> dict[str, Any]:
    report_payload = {'name': 'Fee extraction bug verification', 'target_month': 2, 'target_year': 2026}
    rid = api_request('POST', '/reports', token, json=report_payload).json()['report_id']

    uploaded = {}
    for filename in ['orders.txt', 'payment.csv', 'fba_returns.csv', 'easyship_returns.tsv', 'ad_spend.csv']:
        fp = SAMPLES / filename
        require(fp.exists(), f'Missing sample file: {fp}')
        with fp.open('rb') as f:
            resp = api_request('POST', f'/reports/{rid}/upload', token, files={'file': (filename, f)})
        body = resp.json()
        uploaded[filename] = {'detected_type': body.get('detected_type'), 'rows': body.get('rows')}

    detected_types = {v['detected_type'] for v in uploaded.values()}
    require('fba_removal' not in detected_types, f'Unexpected fba_removal detected/uploaded: {uploaded}')
    require({'orders', 'payment', 'fba_returns', 'easyship_returns', 'ad_spend'} <= detected_types,
            f'Not all required files detected correctly: {uploaded}')

    build = api_request('POST', f'/reports/{rid}/build', token).json()
    skus = build.get('skus') or []
    require(len(skus) > 0, f'Build returned no SKUs: {build}')

    costs = [
        {'sku': s['sku'], 'product_name': s.get('product_name') or '', 'cost_price': 100}
        for s in skus
        if s.get('sku')
    ]
    api_request('POST', f'/reports/{rid}/costs', token, json={'costs': costs})

    summary = api_request('POST', f'/reports/{rid}/finalize', token).json()['summary']
    persisted = api_request('GET', f'/reports/{rid}', token).json().get('summary')
    require(persisted, 'Finalized summary was not persisted/retrievable by GET /reports/{id}')

    expected = {
        'inbound_fee': 311.52,
        'storage_fee': 529.91,
        'removal_fee': 94.40,
        'reimbursement': 274.76,
    }
    for key, exp in expected.items():
        require(approx(summary.get(key), exp), f'{key} expected approximately {exp}, got {summary.get(key)}')
    for key in ['inbound_fee', 'storage_fee', 'removal_fee']:
        require(float(summary.get(key, 0)) > 0, f'{key} should be > 0, got {summary.get(key)}')

    diag = summary.get('diagnostics')
    require(isinstance(diag, dict), f'Missing diagnostics dict in summary: {summary.keys()}')
    required_diag_keys = [
        'payment_rows_total', 'payment_rows_with_date', 'payment_rows_in_target_month',
        'storage_matches', 'inbound_matches', 'removal_matches',
        'payment_columns', 'payment_desc_samples'
    ]
    for key in required_diag_keys:
        require(key in diag, f'Missing diagnostics key: {key}; diagnostics={diag}')
    for key in ['payment_rows_total', 'payment_rows_with_date', 'payment_rows_in_target_month',
                'storage_matches', 'inbound_matches', 'removal_matches']:
        require(int(diag.get(key, 0)) > 0, f'Diagnostics {key} should be > 0, got {diag.get(key)}')
    require(isinstance(diag.get('payment_columns'), list) and len(diag['payment_columns']) > 0,
            f'payment_columns should be a non-empty list: {diag.get("payment_columns")}')
    require(isinstance(diag.get('payment_desc_samples'), list) and len(diag['payment_desc_samples']) > 0,
            f'payment_desc_samples should be a non-empty list: {diag.get("payment_desc_samples")}')

    return {
        'report_id': rid,
        'uploaded': uploaded,
        'build_rows_count': build.get('rows_count'),
        'sku_count': len(skus),
        'summary_subset': {k: summary.get(k) for k in ['inbound_fee', 'storage_fee', 'removal_fee', 'reimbursement']},
        'diagnostics': diag,
        'persisted_summary_matches': {k: persisted.get(k) for k in ['inbound_fee', 'storage_fee', 'removal_fee', 'reimbursement']} == {k: summary.get(k) for k in ['inbound_fee', 'storage_fee', 'removal_fee', 'reimbursement']},
    }


def test_direct_column_aliases() -> dict[str, Any]:
    synthetic_payment = [
        {'Posted Date': '10 Feb 2026 5:56:11 am UTC', 'Description': 'FBA Inbound Pickup Service', 'Amount': '-311.52'},
        {'Posted Date': '7 Mar 2026 1:26:40 am UTC', 'Description': 'FBA storage fee', 'Amount': '-529.91'},
        {'Posted Date': '4 Feb 2026 3:24:56 pm UTC', 'Description': 'FBA Removal Order: Return Fee', 'Amount': '-82.60'},
    ]
    summary = compute_summary(rows=[], payment=synthetic_payment, fba_removal=[], ad_spend=[], target_month=2, target_year=2026)
    expected = {'inbound_fee': 311.52, 'storage_fee': 529.91, 'removal_fee': 82.60}
    for key, exp in expected.items():
        require(approx(summary.get(key), exp), f'direct compute_summary {key} expected {exp}, got {summary.get(key)}; summary={summary}')
    diag = summary.get('diagnostics') or {}
    for key in ['storage_matches', 'inbound_matches', 'removal_matches']:
        require(int(diag.get(key, 0)) > 0, f'direct diagnostics {key} expected >0, got {diag.get(key)}')
    return {'summary_subset': {k: summary.get(k) for k in expected}, 'diagnostics': diag}


def main():
    results: dict[str, Any] = {'api_base': API_BASE, 'tests': {}}
    token, user_id = create_session()
    results['seeded_user_id'] = user_id
    results['tests']['full_api_flow'] = test_full_api_flow(token)
    results['tests']['direct_column_aliases'] = test_direct_column_aliases()
    results['verdict'] = 'passed'
    print(json.dumps(results, indent=2, default=str))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'verdict': 'failed', 'error': str(exc)}, indent=2), file=sys.stderr)
        raise
