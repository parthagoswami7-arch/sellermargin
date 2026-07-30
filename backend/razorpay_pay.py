"""Razorpay payment gateway helpers.

Uses the official `razorpay` Python SDK for order creation + payment fetch,
and manual HMAC-SHA256 for both checkout signature and webhook signature
verification (matches Razorpay's documented scheme).
"""
from __future__ import annotations
import os, hmac, hashlib, logging
import razorpay

logger = logging.getLogger(__name__)

RAZORPAY_KEY_ID        = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET    = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")

_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_KEY_ID else None


def _client_or_raise() -> razorpay.Client:
    if not _client:
        raise RuntimeError("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured")
    return _client


def create_order(amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    """Create a Razorpay order. `amount_paise` must be an int in paise (e.g. Rs 49 → 4900).
    `receipt` is a merchant-side reference (<=40 chars). Returns Razorpay's order dict."""
    c = _client_or_raise()
    body = {
        "amount": int(amount_paise),
        "currency": "INR",
        "receipt": receipt[:40],
        "payment_capture": 1,
    }
    if notes:
        body["notes"] = {k: str(v)[:250] for k, v in notes.items() if v is not None}
    return c.order.create(data=body)


def fetch_order(razorpay_order_id: str) -> dict:
    return _client_or_raise().order.fetch(razorpay_order_id)


def fetch_payment(razorpay_payment_id: str) -> dict:
    return _client_or_raise().payment.fetch(razorpay_payment_id)


def verify_checkout_signature(razorpay_order_id: str, razorpay_payment_id: str, signature: str) -> bool:
    """Verify the signature returned by Razorpay Checkout after a successful payment.
    Scheme: HMAC-SHA256(key_secret, order_id + '|' + payment_id) == signature."""
    if not (razorpay_order_id and razorpay_payment_id and signature and RAZORPAY_KEY_SECRET):
        return False
    body = f"{razorpay_order_id}|{razorpay_payment_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Verify webhook signature. Scheme: HMAC-SHA256(webhook_secret, raw_body) == X-Razorpay-Signature."""
    if not (signature and RAZORPAY_WEBHOOK_SECRET):
        return False
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
