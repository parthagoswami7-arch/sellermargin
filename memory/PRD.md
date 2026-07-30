# Seller Margin — PRD

## Original problem statement
SaaS web app for monthly P&L reconciliation for Amazon India sellers. Ingests 5 Amazon reports, auto-derives fees + unit costs + reimbursements + returns, produces per-SKU + monthly P&L, exports to Dashboard/PDF/Excel. Sold via paid plans on `https://sellermargin.in` (production).

## Owner / legal
- Business name (invoices, footer, legal): **AHAN S INTERNATIONAL**
- Admin email: `ahansinternationalkolkata@gmail.com`

## Architecture
- Frontend: React + Tailwind + Shadcn UI + Sonner + Razorpay Checkout.js
- Backend: FastAPI + Motor (MongoDB) + Pandas + ReportLab
- Payments: **Razorpay** (live) — replaced Cashfree entirely on 2026-02-27
- Emails: Emergent-managed Resend proxy
- Auth: Emergent-managed Google OAuth
- Hosted on Emergent; production domain `sellermargin.in`

## Payment integration (Razorpay)
- Env vars: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- Backend helpers: `/app/backend/razorpay_pay.py`
- Endpoints:
  - `POST /api/payments/rzp/create-order` — creates Razorpay order, records in Mongo
  - `POST /api/payments/rzp/verify` — verifies checkout HMAC signature, fulfills
  - `POST /api/webhook/razorpay` — verifies X-Razorpay-Signature (HMAC-SHA256), fulfills
- Fulfillment gated by `razorpay.order.fetch` — payment must be `paid` before code/quota/email issued.
- Collection: `db.orders` (renamed from `cf_orders`).

## Plans
- `trial_10` — ₹49 for 7 days, 1 report
- `annual` — ₹499 for 365 days, 12 reports
- `topup_5` — ₹249 for 5 add-on reports (no expiry extension)
- `agency_starter` — coming soon (WhatsApp CTA)

## Implemented (session-by-session highlights)
- 2026-02: **Removed Cashfree, integrated Razorpay end-to-end** (backend + frontend + admin)
- 2026-02: Removed unused Stripe scaffolding entirely
- 2026-02: Company name → AHAN S INTERNATIONAL on Terms, Contact, Refunds
- 2026-02: GST (18%) at checkout, PDF Tax Invoice, GSTR-1 export, Sales CSV, admin resend email
- 2026-02: Report quotas + top-up plan + FOMO pricing
- 2026-02: Live at `sellermargin.in`

## Priority backlog
- **P0** — Get Razorpay Webhook Secret from user, add to `.env`, redeploy prod
- **P0** — Multi-month comparison chart on Dashboard
- **P1** — SKU cost bulk-import via CSV
- **P1** — Email finalized P&L report to user's inbox on report completion
- **P1** — Verify sender domain `sellermargin.in` with Emergent Email to fix spam deliverability
- **P2** — UTM attribution on landing (`utm_source` tracking)

## Refactor backlog
- Split `server.py` (1200+ lines) → `admin_routes.py`, `payment_routes.py`, `report_routes.py`
