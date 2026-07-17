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

## Roadmap / Backlog
- P0: Multi-month comparison chart (currently only per-month)
- P0: Razorpay INR alternative (Stripe India not supported by claimable sandbox)
- P1: SKU cost bulk import via CSV
- P1: Detailed fee-type breakdown drill-down
- P1: Email report on finalization
- P2: Multi-marketplace (US, UK, UAE)
- P2: GST / TDS separated line items
- P2: Reconciliation diff between months
