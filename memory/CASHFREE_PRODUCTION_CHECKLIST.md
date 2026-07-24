# Cashfree Production — Whitelisting & Go-Live Checklist

## Why this exists
Cashfree production API blocks checkout from any domain not explicitly whitelisted in the merchant dashboard. If you don't whitelist, buyers see a "Broken Link!" error with message: "https://<yourdomain>/ is not enabled or approved."

## Required steps (in order)

### 1. Whitelist your domain(s)
Go to: https://merchant.cashfree.com/merchants/pg/developers/whitelisting

Add BOTH of these URLs (or whichever ones you use):
- `https://seller-pnl-pro.preview.emergentagent.com` (current preview — temporary)
- `https://sellermargin.in` (your future production domain — add once DNS is live)

Click "Raise Whitelisting Request". Cashfree usually approves in 1 business day for verified/KYC-complete merchants; sometimes instant for existing merchants.

### 2. Configure the webhook
Go to: https://merchant.cashfree.com/merchants/pg/developers/webhooks

Add webhook:
- URL: `https://seller-pnl-pro.preview.emergentagent.com/api/webhook/cashfree` (update to `https://sellermargin.in/api/webhook/cashfree` after domain switch)
- Events: `PAYMENT_SUCCESS_WEBHOOK`
- Save — Cashfree will show a **Webhook Secret**. Copy that and send to me so I can add signature verification.

### 3. Test with a small real payment
Once whitelisting is approved, place a real ₹49 purchase from your own admin account with a UPI ID you control. Verify:
- Cashfree modal opens without "Broken Link" error
- Payment succeeds
- Activation email arrives (contingent on email-delivery fix — see PRD)
- Invoice PDF downloadable
- User's paid_until + reports_quota update in the admin panel

### 4. When you switch to sellermargin.in domain
- Re-do steps 1 and 2 with the new domain
- I'll swap PUBLIC_APP_URL + REACT_APP_BACKEND_URL in .env
