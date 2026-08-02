"""Meta (Facebook) Conversions API — server-side Purchase event sender.

Fires alongside the browser-side Pixel event using the SAME `event_id` so Meta
dedupes and doesn't count the purchase twice.
"""
from __future__ import annotations
import os, hashlib, logging, time, httpx

logger = logging.getLogger(__name__)

META_PIXEL_ID     = os.environ.get("META_PIXEL_ID", "")
META_ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
META_API_VERSION  = os.environ.get("META_API_VERSION", "v19.0")


def _sha256_lower(s: str | None) -> str | None:
    if not s:
        return None
    return hashlib.sha256(s.strip().lower().encode("utf-8")).hexdigest()


async def send_purchase(*, event_id: str, value: float, email: str | None,
                        event_source_url: str | None = None,
                        currency: str = "INR",
                        client_ip: str | None = None,
                        user_agent: str | None = None) -> dict:
    """Fire a server-side Purchase event to Meta CAPI. Never raises — returns a
    small status dict so a failed CAPI call cannot break payment fulfillment."""
    if not (META_PIXEL_ID and META_ACCESS_TOKEN):
        return {"ok": False, "error": "META_PIXEL_ID / META_ACCESS_TOKEN not configured"}
    user_data: dict = {}
    hashed_email = _sha256_lower(email)
    if hashed_email:
        user_data["em"] = [hashed_email]
    if client_ip:
        user_data["client_ip_address"] = client_ip
    if user_agent:
        user_data["client_user_agent"] = user_agent
    event: dict = {
        "event_name": "Purchase",
        "event_time": int(time.time()),
        "event_id": event_id,
        "action_source": "website",
        "user_data": user_data,
        "custom_data": {"currency": currency, "value": round(float(value), 2)},
    }
    if event_source_url:
        event["event_source_url"] = event_source_url
    url = f"https://graph.facebook.com/{META_API_VERSION}/{META_PIXEL_ID}/events"
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(url, params={"access_token": META_ACCESS_TOKEN}, json={"data": [event]})
        ok = 200 <= r.status_code < 300
        if not ok:
            logger.error("Meta CAPI FAILED status=%s body=%s", r.status_code, r.text[:400])
            return {"ok": False, "status": r.status_code, "error": r.text[:300], "event_id": event_id}
        try:
            data = r.json()
        except Exception:
            data = {}
        logger.info("Meta CAPI OK event_id=%s events_received=%s", event_id, data.get("events_received"))
        return {"ok": True, "event_id": event_id, "events_received": data.get("events_received"),
                "fbtrace_id": data.get("fbtrace_id")}
    except Exception as e:
        logger.exception("Meta CAPI exception event_id=%s: %s", event_id, e)
        return {"ok": False, "error": str(e)[:300], "event_id": event_id}
