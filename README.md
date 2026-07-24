# Seller Margin

Amazon monthly P&L reconciliation SaaS for Indian sellers. Users upload 5 Amazon reports (All Orders, Payment/Settlement, FBA Returns, Easy Ship Returns, Sponsored Products Ads) and get a fully reconciled monthly profit & loss with charts, PDF, and Excel export.

## Tech
- **Backend**: FastAPI, Motor (MongoDB async), pandas, ReportLab, openpyxl
- **Frontend**: React 19, Tailwind, Shadcn UI, Cashfree JS SDK
- **Payments**: Cashfree PG (India)
- **Auth**: Emergent-managed Google OAuth
- **Email**: Emergent-managed Resend proxy
- **PDF/Excel**: ReportLab for invoices + P&L reports, openpyxl for GSTR-1

## Local dev

```bash
# Backend
cd backend
cp .env.example .env  # fill in real values
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend
cp .env.example .env  # set REACT_APP_BACKEND_URL
yarn install
yarn start
```

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list. Never commit real `.env` files.

## Key documentation

- `memory/PRD.md` — product requirements + implementation changelog
- `memory/DOMAIN_DEPLOY.md` — custom domain setup checklist
- `memory/CASHFREE_PRODUCTION_CHECKLIST.md` — Cashfree go-live steps (whitelisting, webhook, testing)
- `memory/test_credentials.md` — how to seed test users for integration testing

## Feature highlights

- 5-report Amazon P&L engine (fees auto-derived from Payment CSV)
- SKU cost library persisted month-to-month
- Returns review UI with FBA LPN display + repack cost overrides
- GST-compliant tax invoices (CGST/SGST vs IGST auto-split)
- Report quota system (1 for trial, 12 for annual, 5 for top-up)
- Admin panel: user management, activation code generation, sales register CSV, GSTR-1 filing Excel, per-order invoice download, resend email, delete order with quota reversal
- Anti-abuse: distinct-month quota semantics prevent agency account-sharing
- WhatsApp help widget on every page
