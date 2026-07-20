"""Cashfree + Emergent email helpers."""
from __future__ import annotations
import os, hmac, hashlib, base64, logging, httpx

logger = logging.getLogger(__name__)

CF_APP_ID     = os.environ.get("CF_APP_ID", "")
CF_SECRET_KEY = os.environ.get("CF_SECRET_KEY", "")
CF_ENV        = os.environ.get("CF_ENV", "sandbox")
CF_API_VERSION = os.environ.get("CF_API_VERSION", "2025-01-01")
CF_BASE = "https://sandbox.cashfree.com/pg" if CF_ENV == "sandbox" else "https://api.cashfree.com/pg"

def _cf_headers():
    return {
        "x-client-id": CF_APP_ID,
        "x-client-secret": CF_SECRET_KEY,
        "x-api-version": CF_API_VERSION,
        "content-type": "application/json",
        "accept": "application/json",
    }

async def cf_create_order(order_id: str, amount: float, customer: dict, return_url: str, notify_url: str) -> dict:
    body = {
        "order_id": order_id,
        "order_amount": float(amount),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": customer["id"],
            "customer_name": customer["name"] or "Customer",
            "customer_email": customer["email"],
            "customer_phone": customer.get("phone", "9999999999"),
        },
        "order_meta": {"return_url": return_url, "notify_url": notify_url},
    }
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{CF_BASE}/orders", headers=_cf_headers(), json=body)
    r.raise_for_status()
    return r.json()

async def cf_get_order(order_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{CF_BASE}/orders/{order_id}", headers=_cf_headers())
    r.raise_for_status()
    return r.json()

def cf_verify_webhook(raw: bytes, signature: str, timestamp: str) -> bool:
    if not signature or not timestamp:
        return False
    signed = (timestamp.encode() + raw)
    expected = base64.b64encode(hmac.new(CF_SECRET_KEY.encode(), signed, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(expected, signature)


# ---------------- email ----------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Seller Margin")

async def send_activation_email(to_email: str, code: str, plan_label: str, days: int, site_url: str, expiry_iso: str):
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY not set; skipping email send")
        return None
    html = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F9FA;padding:32px 0;font-family:Manrope,Arial,sans-serif;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #D8DAD5;">
          <tr><td style="padding:32px 32px 8px 32px;">
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;color:#044535;letter-spacing:-.5px;">Seller Margin</div>
            <div style="font-size:11px;letter-spacing:3px;color:#5C5F5A;text-transform:uppercase;margin-top:4px;">Amazon P&amp;L</div>
          </td></tr>
          <tr><td style="padding:16px 32px;">
            <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;color:#0A0B08;margin:0 0 8px 0;">Thanks for your purchase.</h2>
            <p style="font-size:14px;color:#5C5F5A;line-height:1.6;margin:0 0 20px 0;">
              Your <b>{plan_label}</b> is active for <b>{days} days</b>. You've been automatically activated on the site — no code entry needed. This code is stored as your receipt in case you need to re-activate later.
            </p>
            <div style="border:2px solid #F4B223;background:#FFF9EB;padding:20px;text-align:center;margin:0 0 20px 0;">
              <div style="font-size:11px;letter-spacing:2px;color:#5C5F5A;text-transform:uppercase;margin-bottom:8px;">Activation code</div>
              <div style="font-family:'JetBrains Mono',Consolas,monospace;font-size:22px;letter-spacing:3px;color:#044535;font-weight:600;">{code}</div>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
              <tr>
                <td style="font-size:12px;color:#5C5F5A;padding:6px 0;">Plan</td>
                <td style="font-size:12px;color:#0A0B08;padding:6px 0;text-align:right;font-family:'JetBrains Mono',monospace;">{plan_label}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#5C5F5A;padding:6px 0;border-top:1px solid #eee;">Duration</td>
                <td style="font-size:12px;color:#0A0B08;padding:6px 0;text-align:right;border-top:1px solid #eee;font-family:'JetBrains Mono',monospace;">{days} days</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#5C5F5A;padding:6px 0;border-top:1px solid #eee;">Access expires</td>
                <td style="font-size:12px;color:#0A0B08;padding:6px 0;text-align:right;border-top:1px solid #eee;font-family:'JetBrains Mono',monospace;">{expiry_iso[:10]}</td>
              </tr>
            </table>
            <div style="text-align:center;margin:24px 0 8px 0;">
              <a href="{site_url}/dashboard" style="background:#044535;color:#fff;text-decoration:none;padding:14px 28px;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;display:inline-block;">Open Dashboard</a>
            </div>
            <div style="text-align:center;font-size:11px;color:#5C5F5A;margin-top:12px;">
              or paste this link: <a href="{site_url}" style="color:#044535;">{site_url}</a>
            </div>
          </td></tr>
          <tr><td style="padding:20px 32px;background:#F8F9FA;border-top:1px solid #D8DAD5;font-size:11px;color:#5C5F5A;line-height:1.6;">
            Questions? Just reply to this email. Keep this receipt safe — it's proof of purchase.
          </td></tr>
        </table>
      </td></tr>
    </table>
    """
    payload = {"to": [to_email], "subject": f"Your {plan_label} activation code — Seller Margin",
               "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                             headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        if r.status_code >= 400:
            logger.error("Email send failed %s %s", r.status_code, r.text[:300])
            return None
        return r.json()
    except Exception as e:
        logger.exception("Email send exception: %s", e)
        return None
