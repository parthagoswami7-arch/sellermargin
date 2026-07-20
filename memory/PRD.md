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

## Roadmap / Backlog
- P0: Multi-month comparison chart (currently only per-month)
- P0: Razorpay INR alternative (Stripe India not supported by claimable sandbox)
- P1: Ship the Agency Starter plan (make it purchasable — add to PLANS with `available:true` and give a Cashfree flow)
- P1: SKU cost bulk import via CSV
- P1: Detailed fee-type breakdown drill-down
- P1: Email report on finalization
- P1: Owner to fill actual business details via Admin > Business settings (placeholders currently in use)
- P1: Admin ability to manually adjust a user's `reports_quota` (edge cases: partial refunds, goodwill top-ups)
- P2: Multi-marketplace (US, UK, UAE)
- P2: Reconciliation diff between months
- P2: Refactor server.py (~1065 lines) into routers: payments/invoices/settings/admin
- P2: Convert money math to `decimal.Decimal` to avoid paisa-level drift on complex amounts
- P2: GSTIN format validation (regex 15-char)
