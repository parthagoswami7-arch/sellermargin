import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
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

      <main className="max-w-[900px] mx-auto px-8 py-16 legal-content">
        <div className="label-caps mb-4">Legal</div>
        <h1 className="font-serif text-5xl tracking-tight mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-muted-foreground mb-12">Effective from 27 February 2026 · Last updated 27 February 2026</p>

        <Section n="1" title="Who we are">
          <p>Seller Margin ("Service", "we", "us", "our") is a Software-as-a-Service (SaaS) product operated by <b>Ahans International</b>, an entity registered in Kolkata, West Bengal, India ("Company"). The Service provides Amazon India sellers with a monthly Profit &amp; Loss (P&amp;L) reconciliation tool. By creating an account or purchasing a plan, you ("User", "you") agree to these Terms in full.</p>
        </Section>

        <Section n="2" title="Eligibility">
          <p>You must be at least 18 years old, legally competent to enter contracts under Indian law, and using the Service for a legitimate business purpose. If you're using the Service on behalf of a company, you represent that you have authority to bind that company to these Terms.</p>
        </Section>

        <Section n="3" title="Account &amp; access">
          <p>You sign in using your Google account. You are responsible for keeping your Google credentials secure. Any activity on your account is your responsibility. Do not share your account, activation code, or invoice link with third parties — each paid plan is licensed to a single seller.</p>
        </Section>

        <Section n="4" title="Plans, pricing &amp; GST">
          <ul className="list-disc list-inside space-y-2">
            <li><b>7-Day Trial:</b> ₹49 + 18% GST, 1 report included</li>
            <li><b>1-Year Access:</b> ₹499 + 18% GST, 12 reports included, valid 365 days from purchase</li>
            <li><b>5 Extra Reports Top-up:</b> ₹249 + 18% GST, does not extend your access period</li>
          </ul>
          <p>Prices are quoted in Indian Rupees (INR) and are exclusive of applicable GST. GST is charged at the prevailing rate (currently 18%) as CGST + SGST when your billing state matches ours, else IGST. A GST-compliant tax invoice is issued and emailed on every successful purchase.</p>
          <p>Pricing may change with 15 days' prior notice via email or on-site announcement. Ongoing subscriptions honour the price at the time of purchase for their remaining validity.</p>
        </Section>

        <Section n="5" title="Report quota">
          <p>One "report" is defined as one calendar month's reconciliation for a specific (month, year) combination. Regenerating the same month is free and does not consume additional quota. Deleting a report frees its quota slot. Unused reports carry forward when you renew or top up. Any attempt to circumvent quota limits — including but not limited to sharing accounts with other sellers or using automated tools — may result in immediate account suspension without refund.</p>
        </Section>

        <Section n="6" title="Payment processing">
          <p>All payments are processed via Cashfree Payment Gateway. We do not store your card, UPI, or netbanking credentials on our servers. Payment failures, chargebacks, and refunds are handled per the Refund &amp; Cancellation Policy (see separate page).</p>
        </Section>

        <Section n="7" title="Use of your data">
          <p>You upload Amazon reports containing your sales, returns, fees, and SKU-level data. This data is stored securely, used only for computing your P&amp;L and displaying it back to you, and never shared with any third party. See our Privacy statement for full details. You may request full deletion of your account and data by emailing <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a>.</p>
        </Section>

        <Section n="8" title="Acceptable use">
          <p>You agree NOT to: (a) reverse-engineer, decompile, or copy the Service; (b) use the Service to process data you don't legally own or have authorization to process; (c) scrape, spam, or overload our servers; (d) resell or sub-license the Service without a written agreement.</p>
        </Section>

        <Section n="9" title="Availability &amp; support">
          <p>The Service is provided on an "as-is, as-available" basis. We aim for 99% uptime but do not commit to any specific SLA. Support is available via WhatsApp (+91 89108 71321) and email (<a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a>), Mon–Sat 10 AM – 8 PM IST.</p>
        </Section>

        <Section n="10" title="Limitation of liability">
          <p>The P&amp;L computations produced by the Service are for informational purposes only. You are solely responsible for filing accurate tax returns, GST returns, and any regulatory filings. Under no circumstance shall the Company be liable for direct, indirect, incidental, or consequential damages arising from your use of the Service. Our aggregate liability under these Terms is capped at the total fees you paid in the 3 months preceding the claim.</p>
        </Section>

        <Section n="11" title="Termination">
          <p>You may cancel your account any time by emailing us. We may suspend or terminate your account for breach of these Terms, non-payment, fraudulent activity, or reasonable suspicion of misuse. Termination for cause does not entitle you to a refund of unused fees.</p>
        </Section>

        <Section n="12" title="Governing law &amp; jurisdiction">
          <p>These Terms are governed by the laws of India. Any dispute shall be subject to the exclusive jurisdiction of the courts in Kolkata, West Bengal.</p>
        </Section>

        <Section n="13" title="Changes to these Terms">
          <p>We may update these Terms from time to time. Material changes will be notified via email at least 15 days in advance. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.</p>
        </Section>

        <Section n="14" title="Contact">
          <p>For any question about these Terms, write to <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a> or WhatsApp us at <b>+91 89108 71321</b>.</p>
        </Section>
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

function Section({ n, title, children }) {
  return (
    <div className="mb-10" data-testid={`section-${n}`}>
      <h2 className="font-serif text-2xl mb-3 flex items-baseline gap-3">
        <span className="text-muted-foreground font-mono text-sm">{n}.</span>{title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
