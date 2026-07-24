# Domain + Deploy Checklist — sellermargin.in

## Order matters — do NOT run these out of order or your live preview breaks.

### Stage 1 — Register + prep (5 min, do first)
1. Buy `sellermargin.in` from a registrar (GoDaddy / Namecheap / Cloudflare / Hostinger)
2. In the registrar's DNS panel, wait — do nothing yet. We add records only when Emergent tells us what to add.

### Stage 2 — Deploy on Emergent (10 min)
1. From the Emergent chat sidebar (this app), click **"Save to GitHub"** → confirm. This pushes your code to a private GitHub repo tied to your Emergent account.
2. From the Emergent sidebar, click **"Deploy"**.
3. Follow the wizard:
   - Confirm resources
   - When asked for a custom domain, enter: `sellermargin.in`
   - Emergent will show 2–3 DNS records (usually an `A` record + a `CNAME` for `www`, plus possibly a TXT for verification)
4. Copy those DNS records.

### Stage 3 — Point DNS (5 min + 30–60 min propagation)
1. Go to your domain registrar's DNS panel
2. Add the DNS records Emergent gave you (delete any default ones)
3. Wait 30–60 min for propagation
4. Verify: `dig sellermargin.in` or `nslookup sellermargin.in` should show Emergent's IPs

### Stage 4 — Env var swap (I do this — 2 min)
Once Emergent confirms the domain is serving your app, tell me "domain is live". I will:
- Update `backend/.env` → `PUBLIC_APP_URL=https://sellermargin.in`
- Update `frontend/.env` → `REACT_APP_BACKEND_URL=https://sellermargin.in`
- Restart supervisor
- Verify with a curl

### Stage 5 — Update Cashfree webhook (1 min)
Go to https://merchant.cashfree.com → Developers → Webhooks → edit the webhook you added earlier:
- Old URL: `https://seller-pnl-pro.preview.emergentagent.com/api/webhook/cashfree`
- New URL: `https://sellermargin.in/api/webhook/cashfree`
- Save

### Stage 6 — Update Google OAuth callback (1 min)
If Emergent-managed Google Auth uses a fixed callback URL tied to the preview, tell me and I'll ask Emergent Support. In most cases it Just Works because Emergent-managed auth auto-detects the current host.

### Stage 7 — Smoke test (2 min)
1. Open `https://sellermargin.in` in a fresh incognito window
2. Sign in with Google using `ahansinternationalkolkata@gmail.com`
3. Confirm sidebar shows "Admin"
4. Try a real ₹49 purchase with a small amount to confirm end-to-end works
5. Verify buyer email delivery (requires the email-delivery fix — see PRD)
