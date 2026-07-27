import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertCircle, MessageCircle } from "lucide-react";
import { whatsappLink } from "../components/WhatsAppFab";

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[900px] mx-auto px-8 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/brand/logo.png" alt="Seller Margin" className="h-8 w-8 object-contain"/>
            <span className="font-serif text-xl">Seller Margin</span>
          </Link>
          <Link to="/" className="btn-ghost text-xs"><ArrowLeft size={12} className="inline mr-2"/>Home</Link>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-16">
        <div className="label-caps mb-4">Legal</div>
        <h1 className="font-serif text-5xl tracking-tight mb-2">Refund &amp; Cancellation Policy</h1>
        <p className="text-sm text-muted-foreground mb-12">Effective from 27 February 2026 · Last updated 27 February 2026</p>

        <div className="border-2 border-accent bg-accent/10 p-6 mb-10 flex items-start gap-4" data-testid="refund-summary">
          <AlertCircle size={20} className="text-accent shrink-0 mt-0.5"/>
          <div>
            <div className="font-serif text-xl mb-1">Short version</div>
            <p className="text-sm text-muted-foreground">
              We offer a <b>7-day money-back guarantee</b> on the ₹49 trial and ₹499 annual plans. Top-ups (₹249 for 5 reports) are refundable only if unused. Refunds are processed within 5–7 business days to the original payment method.
            </p>
          </div>
        </div>

        <Section title="1. Full refund window (7 days)">
          <p>You are eligible for a full refund if you request one within <b>7 calendar days</b> of your first purchase AND you have generated <b>0 reports</b> during that period. In that case, we refund 100% of what you paid (base + GST) to the original payment method.</p>
          <p>The 7-day window starts from the timestamp on your GST tax invoice.</p>
        </Section>

        <Section title="2. Partial refund (used but unhappy)">
          <p>If you've generated some reports but are unhappy with the Service within 30 days of purchase, we may offer a pro-rated refund on the unused portion at our discretion. Contact us with your reason — we usually approve genuine complaints (e.g., a specific feature didn't work as advertised, ongoing bugs we can't resolve).</p>
          <p>Pro-rated refund formula for the annual plan: <span className="font-mono text-sm">refund = (unused_reports / 12) × ₹499 + GST</span></p>
        </Section>

        <Section title="3. Top-up refunds">
          <p>Top-ups (5 extra reports for ₹249 + GST) are <b>refundable only if 0 of the 5 top-up reports have been used</b>. Once even one top-up report is generated, the top-up becomes non-refundable.</p>
        </Section>

        <Section title="4. Non-refundable situations">
          <ul className="list-disc list-inside space-y-2">
            <li>You have generated more than half your quota (7+ reports on the annual plan, 3+ on a top-up)</li>
            <li>Refund requested more than 30 days after purchase</li>
            <li>Account suspended for breach of Terms (fraud, account sharing, chargeback abuse)</li>
            <li>You did not receive an activation email but did not contact us within 7 days to resolve — please always check your spam folder and email us before disputing</li>
          </ul>
        </Section>

        <Section title="5. Cancellation of subscription">
          <p>Our plans are one-time purchases, not auto-renewing subscriptions. You are never charged automatically. When your plan expires (7 days for trial, 365 days for annual), your access simply stops and no further charges occur. You can cancel your account at any time by emailing us — we'll deactivate it immediately.</p>
        </Section>

        <Section title="6. Chargebacks &amp; disputes">
          <p>Please <b>talk to us first</b> before filing a chargeback with your bank or card issuer. Chargebacks cost us disproportionately more than the refund itself and hurt our merchant account with Cashfree. In exchange for talking to us first, we promise:</p>
          <ul className="list-disc list-inside space-y-2 mt-3">
            <li>Response within 24 hours (WhatsApp) / 2 business days (email)</li>
            <li>Refund approval within 3 business days if your case qualifies</li>
            <li>No hard-selling, no interrogation — just a quick resolution</li>
          </ul>
        </Section>

        <Section title="7. Processing time">
          <p>Once approved, refunds are initiated within 3 business days via Cashfree back to the original payment method:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><b>UPI:</b> 1–2 business days</li>
            <li><b>Debit / Credit card:</b> 5–7 business days</li>
            <li><b>Netbanking:</b> 3–5 business days</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-3">If a refund hasn't reached you 7 days after we send you the confirmation, please contact your bank/card issuer with the Cashfree Refund ID (we include it in the confirmation email).</p>
        </Section>

        <Section title="8. GST reversal">
          <p>When we refund a purchase, we also reverse the GST collected on that transaction. Your original GST invoice is superseded by a credit note. Your Input Tax Credit (if any) on the original invoice must be reversed correspondingly in your GST return for the month of the credit note.</p>
        </Section>

        <Section title="9. How to request a refund">
          <p>Email us at <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a> with subject line <span className="font-mono text-sm">"Refund Request – &lt;Your Order ID&gt;"</span>. Include:</p>
          <ol className="list-decimal list-inside space-y-1 mt-3">
            <li>Order ID (from your GST invoice)</li>
            <li>Reason for refund</li>
            <li>Payment method used</li>
          </ol>
          <p className="text-sm text-muted-foreground mt-3">Or WhatsApp us at <b>+91 89108 71321</b> for faster response.</p>
        </Section>

        <div className="border border-primary bg-primary/5 p-8 mt-12 flex items-start gap-4">
          <MessageCircle size={22} className="text-primary shrink-0 mt-1"/>
          <div>
            <div className="font-serif text-xl mb-2">Need to request a refund now?</div>
            <p className="text-sm text-muted-foreground mb-4">Fastest way is WhatsApp — we handle refunds personally.</p>
            <a href={whatsappLink("Hi, I'd like to request a refund for a Seller Margin purchase. My Order ID is —")}
              target="_blank" rel="noreferrer noopener"
              className="btn-emerald text-xs inline-block" data-testid="refund-wa-btn">
              Chat about a refund
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-10 text-center text-xs text-muted-foreground">
        <div>© 2026 Seller Margin — Amazon P&amp;L Reconciliation.</div>
        <div className="mt-2 space-x-4">
          <Link to="/terms" className="hover:text-primary">Terms &amp; Conditions</Link>
          <Link to="/refunds" className="hover:text-primary">Refund &amp; Cancellation</Link>
          <Link to="/contact" className="hover:text-primary">Contact us</Link>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="font-serif text-2xl mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
