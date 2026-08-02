# Seller Margin — PRD

## Original problem statement
SaaS web app for monthly P&L reconciliation for Amazon India sellers. Ingests 5 Amazon reports, auto-derives fees + unit costs + reimbursements + returns, produces per-SKU + monthly P&L, exports to Dashboard/PDF/Excel. Sold via paid plans on `https://sellermargin.in` (production).

## Owner / legal
- Business name (invoices, footer, legal): **AHAN S INTERNATIONAL**
- Admin email: `ahansinternationalkolkata@gmail.com`

## Architecture
- Frontend: React + Tailwind + Shadcn UI + Sonner + Razorpay Checkout.js + Meta Pixel
- Backend: FastAPI + Motor (MongoDB) + Pandas + ReportLab + Meta Conversions API
- Payments: **Razorpay live** — replaced Cashfree entirely on 2026-02-27
- Emails: Emergent-managed Resend proxy
- Auth: Emergent-managed Google OAuth
- Hosted on Emergent; production domain `sellermargin.in`

## Payments (Razorpay)
- Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Backend helper: `/app/backend/razorpay_pay.py`
- Endpoints: `POST /api/payments/rzp/create-order`, `POST /api/payments/rzp/verify`, `POST /api/webhook/razorpay`
- Fulfillment gated by `razorpay.order.fetch` (status == "paid") + atomic `code_delivered` flag → idempotent between webhook and verify polling.
- Collection: `db.orders`

## Meta Pixel + Conversions API
- Env: `META_PIXEL_ID`, `META_ACCESS_TOKEN` (backend), `REACT_APP_META_PIXEL_ID` (frontend)
- Browser: base Pixel + PageView in `/app/frontend/public/index.html`. Purchase event fired in `Upgrade.jsx` after verify returns paid.
- Server: `/app/backend/meta_capi.py` sends `Purchase` server-side after fulfillment inside `_fulfill_order_if_paid`.
- **Dedup**: `event_id = purchase_<order_id>` — same value on both browser Pixel event and CAPI event, so Meta counts the purchase once.
- SHA256-hashed email is passed as `user_data.em` for match quality.
- CAPI status stored on order: `meta_capi_sent`, `meta_capi_error`, `meta_capi_fbtrace`.

## Plans
- `trial_10` — ₹49 for 7 days, 1 report
- `annual` — ₹499 for 365 days, 12 reports
- `topup_5` — ₹249 for 5 add-on reports (no expiry extension)
- `agency_starter` — coming soon (WhatsApp CTA)

## Implemented (session-by-session highlights)
- 2026-02: **Meta Pixel base + Purchase browser event + server-side Conversions API with dedup via event_id + SHA256 email hashing** — verified live (events_received=1)
- 2026-02: **Cashfree → Razorpay swap** end-to-end (backend + frontend + admin)
- 2026-02: Removed unused Stripe scaffolding entirely
- 2026-02: Company name → AHAN S INTERNATIONAL on Terms, Contact, Refunds
- 2026-02: GST (18%) at checkout, PDF Tax Invoice, GSTR-1 export, Sales CSV, admin resend email
- 2026-02: Report quotas + top-up plan + FOMO pricing
- 2026-02: Live at `sellermargin.in`

## Priority backlog
- **P0** — Multi-month comparison chart on Dashboard
- **P1** — SKU cost bulk-import via CSV
- **P1** — Email finalized P&L report to user's inbox on report completion
- **P1** — Verify sender domain `sellermargin.in` with Emergent Email to fix spam deliverability
- **P2** — UTM attribution on landing (`utm_source`, tie back into orders for ROAS)
- **P2** — Additional Meta events: InitiateCheckout on Upgrade page load, AddPaymentInfo when checkout modal opens

## Refactor backlog
- Split `server.py` (1250+ lines) → `admin_routes.py`, `payment_routes.py`, `report_routes.py`
