"""Post-purchase transactional email via Emergent-managed Resend proxy."""
from __future__ import annotations
import os, logging, httpx

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Seller Margin")
EMAIL_CONTACT = os.environ.get("EMAIL_CONTACT", "support@sellermargin.in")


async def send_activation_email(to_email: str, code: str, plan_label: str, days: int, site_url: str, expiry_iso: str,
                                invoice_url: str | None = None, invoice_no: str | None = None,
                                gst_total: float | None = None) -> dict:
    """Send the post-purchase activation email. Returns a small status dict:
    {"ok": bool, "id": str|None, "error": str|None}. Never raises — safe to call inline."""
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY not set; skipping email send to %s", to_email)
        return {"ok": False, "id": None, "error": "EMERGENT_EMAIL_KEY not configured"}
    if not to_email or "@" not in to_email:
        return {"ok": False, "id": None, "error": f"Invalid recipient email: {to_email!r}"}
    invoice_block = ""
    if invoice_url and invoice_no:
        total_str = f"Rs. {gst_total:,.2f}" if gst_total is not None else ""
        invoice_block = f"""
            <div style="border:1px dashed #044535;background:#F0F7F5;padding:20px;margin:0 0 20px 0;">
              <div style="font-size:11px;letter-spacing:2px;color:#044535;text-transform:uppercase;margin-bottom:6px;font-weight:600;">GST Tax Invoice</div>
              <div style="font-size:13px;color:#0A0B08;margin-bottom:2px;font-family:'JetBrains Mono',Consolas,monospace;">{invoice_no}</div>
              <div style="font-size:12px;color:#5C5F5A;margin-bottom:12px;">{total_str} incl. 18% GST</div>
              <a href="{invoice_url}" style="background:#F4B223;color:#0A0B08;text-decoration:none;padding:10px 20px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;display:inline-block;">Download Tax Invoice (PDF)</a>
            </div>
        """
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
            {invoice_block}
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
    payload = {
        "to": [to_email],
        "subject": f"Your {plan_label} activation code — Seller Margin",
        "html": html,
        "from_name": EMAIL_FROM_NAME,
        "contact_email": EMAIL_CONTACT,
    }
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                             headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        if r.status_code >= 400:
            logger.error("Email send FAILED to=%s status=%s body=%s", to_email, r.status_code, r.text[:300])
            return {"ok": False, "id": None, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
        data = {}
        try:
            data = r.json() or {}
        except Exception:
            data = {}
        logger.info("Email send OK to=%s id=%s", to_email, data.get("id"))
        return {"ok": True, "id": data.get("id"), "error": None}
    except Exception as e:
        logger.exception("Email send exception to=%s: %s", to_email, e)
        return {"ok": False, "id": None, "error": str(e)[:200]}
