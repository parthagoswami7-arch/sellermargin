# Amazon Monthly P&L Reconciliation — SaaS

## Problem
Amazon sellers spend hours every month reconciling six raw reports from Seller Central into a monthly P&L. This app automates that end-to-end.

## User Personas
- **Primary**: Small-to-mid Indian Amazon sellers, self-serve
- **Secondary**: Amazon-focused accountants managing multiple seller accounts
- **Admin**: App owner (revenue / user monitoring)

## Core Requirements (static)
1. Upload 6 Amazon reports (All Orders .txt, Payment .csv, FBA Returns .csv, Easy-Ship Returns .tsv, FBA Removal .csv, Sponsored Ads .csv) with auto-detection
2. Enter per-SKU unit cost prices; remember them across months
3. Review returns and optionally override cost for SELLABLE items
4. Compute reconciliation matching the reference Excel workbook exactly
5. Dashboard + PDF + Excel exports
6. Persistent monthly history
7. 15-day free trial → ₹249 lifetime paywall (Stripe)
8. Google OAuth (Emergent-managed)
9. Admin console (users, payments, revenue)

## Implemented (2026-02-17)
- Backend (FastAPI + Mongo) with modules: `parsers.py`, `pnl_engine.py`, `exporters.py`, `server.py`
- Frontend (React + Tailwind) with Cormorant/Manrope/JetBrains Mono, Old-Money-Tech palette
- End-to-end wizard: Files → Cost Prices → Returns → Summary
- P&L engine verified against reference workbook formulas
- Excel + PDF exporters
- Emergent Google OAuth
- Stripe Flow B (sk_test_emergent), one-time $3 test proxy for ₹249 lifetime
- Trial tracking + upgrade paywall banner
- Admin stats + user/payment listings
- Auto-detects file types from headers

## Implemented (2026-02-20)
- Cashfree Payments (sandbox) with signed webhook + poll-verify
- Resend email delivery of activation codes
- 5-report system (was 6): storage/inbound/removal fees derived from Payment CSV
- Split of Customer Return % vs RTO %
- Rebranded to "Seller Margin" with custom logo across UI & exports

## Implemented (2026-02-26) — GST + tax invoice
- `invoice.py` — CGST/SGST vs IGST auto-split (18% base), Indian-numbering amount-in-words, FY-based invoice numbering `SM/FY26-27/0001`, ReportLab PDF renderer
- Landing page pricing reads "₹49 + 18% GST" and "₹499 + 18% GST" with "≈ ₹XX all-in" total
- Upgrade page collects optional GST invoice details (business name, GSTIN, state, address); shows live CGST/SGST/IGST breakdown before payment
- `/api/payments/cf/create-order` computes total inc GST and passes total to Cashfree
- On payment success: signed HMAC invoice URL delivered in the same email as the activation code
- `/api/invoices/{order_id}.pdf` — dual-auth (session cookie OR signed link from email)
- Admin > Business settings UI (`/api/admin/settings/seller`) for owner to fill in placeholder GSTIN, address, PAN, state — auto-derives state code from state
- Placeholder seller details ship out-of-the-box so invoicing works from day one

## Implemented (2026-02-27) — Help / WhatsApp support
- WhatsApp FAB (`/app/frontend/src/components/WhatsAppFab.jsx`) — floating bottom-right on Landing + every authenticated page
- Landing Help section (`#help`) with 4 pre-filled quick-chat cards (before-buying / P&L issue / GST invoice / general)
- AppShell sidebar "Help on WhatsApp" link auto-injects user's email in prefilled message
- Footer WhatsApp link on Landing
- All links → `wa.me/918910871321?text=...`

## Implemented (2026-02-27) — Report quota (anti-abuse)
- Per-user `reports_quota` field on user doc — cumulative, starts at 0, `$inc`-ed on every plan purchase or activation-code redemption
- `_distinct_months_used()` counts unique `(target_month, target_year)` tuples across the user's reports — so deleting a report naturally frees its slot
- `create_report` endpoint returns HTTP 402 with a helpful message when quota exhausted; regenerating the SAME month is always free (no quota decrement)
- Admins bypass all quota checks (`reports_unlimited: true`)
- Trial ₹49 → 7 days · 1 report (was 10 days · unlimited). Annual ₹499 → 365 days · 12 reports.
- New "Coming soon" **Agency Starter** plan card — 60 reports / ₹1,999 + GST · "Notify me on WhatsApp" CTA (not purchasable yet — order-create rejects with 400)
- Dashboard, Upgrade, and NewReport pages all show the quota usage strip; NewReport calls out regeneration explicitly with a distinct green banner
- Admin > Users list shows each user's `reports_quota`
- Aligned `trial_end` calculation with `PLANS['trial_10'].days`; new users seeded with `reports_quota: 0` explicitly; compound index added on `(user_id, target_month, target_year)`
- Backend tests: 12/12 (iteration_5.json)

## Implemented (2026-02-27 later) — Top-up plan + FOMO discount
- New **top-up plan** `topup_5`: ₹249 + 18% GST · 5 extra reports · `days: 0` (does NOT extend `paid_until`)
- Purchase flow: `_fulfill_order_if_paid` and `redeem_code` conditionally set `paid_until` only when `plan["days"] > 0`; topups only `$inc reports_quota` on the user doc
- Cashfree order + GST + email + tax-invoice link all work identically for topup (buyer still gets a proper GST invoice)
- **FOMO on Annual (₹499)**: added `list_price_inr: 599` + `discount_note` to the plan. Landing + Upgrade cards render `₹499` next to a strikethrough `₹599`, a "Save ₹100" corner badge, and "⚡ LAUNCH OFFER · LIMITED TIME" caption
- New "Buy 5 top-up (₹249)" contextual CTA on `NewReport` quota banner when user is running low or exhausted; also on Upgrade page as a highlighted strip below the plan cards (respects `?highlight=topup` query param)


## Bug fix (2026-02-27 late) — Post-purchase email not delivered
- Root cause: `send_activation_email()` payload was missing the `contact_email` field required by the Emergent Email proxy. The proxy accepted the request (202) but downstream Resend silently dropped delivery.
- Fix: Added `contact_email` to the payload (env `EMAIL_CONTACT`, default `support@sellermargin.in`). send_activation_email now returns `{ok, id, error}` and both success (`Email send OK`) and failure (`Email send FAILED`) are logged.
- Order doc now stores `email_sent`, `email_send_id`, `email_error`, `email_last_attempt` — full delivery audit trail per order.
- New endpoint POST `/api/admin/orders/{order_id}/resend-email` — admin only, retries delivery using the stored code + invoice.
- Admin UI: new Mail button on each order row (red if last send failed).
- Backend tests: 9/9 (iteration_7.json).

## Roadmap / Backlog
- P0: Multi-month comparison chart (currently only per-month)
- P0: Razorpay INR alternative (Stripe India not supported by claimable sandbox)
- P1: Ship the Agency Starter plan (make it purchasable — add to PLANS with `available:true` and give a Cashfree flow)
- P1: Detailed fee-type breakdown drill-down
- P1: Email report on finalization
- P1: Owner to fill actual business details via Admin > Business settings (placeholders currently in use)
- P1: Admin ability to manually adjust a user's `reports_quota` (edge cases: partial refunds, goodwill top-ups)
- P2: Multi-marketplace (US, UK, UAE)
- P2: Reconciliation diff between months
- P2: Refactor server.py (~1065 lines) into routers: payments/invoices/settings/admin
- P2: Convert money math to `decimal.Decimal` to avoid paisa-level drift on complex amounts
- P2: GSTIN format validation (regex 15-char)
