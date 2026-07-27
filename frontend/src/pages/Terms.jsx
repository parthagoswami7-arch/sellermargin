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

      <main className="max-w-[900px] mx-auto px-8 py-16">
        <div className="label-caps mb-4">Legal</div>
        <h1 className="font-serif text-5xl tracking-tight mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-muted-foreground mb-10">Effective from 27 February 2026 · Last updated 27 February 2026</p>

        <p className="text-[15px] leading-relaxed text-muted-foreground mb-12">
          These Terms &amp; Conditions ("Terms") govern access to and use of Seller Margin (the "Service"), operated by <b>Ahan's International</b> ("we," "us," "our"), available at <span className="font-mono">sellermargin.in</span>. By creating an account or using the Service, you agree to these Terms.
        </p>

        <Section n="1" title="What the Service does">
          <p>
            Seller Margin lets Amazon sellers upload reports downloaded from Amazon Seller Central and generates a monthly profit &amp; loss reconciliation, including revenue, fees, advertising cost, cost of goods sold, and return handling. Uploaded files are processed to generate this output on your behalf.
          </p>
        </Section>

        <Section n="2" title="Accounts">
          <p>
            You must provide accurate information when signing in and are responsible for activity under your account. Notify us immediately at <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a> if you suspect unauthorised use.
          </p>
        </Section>

        <Section n="3" title="Plans, trials, and report limits">
          <p>
            Access is offered under paid plans (currently a <b>7-day / 1-report plan</b> and an <b>annual / 12-report plan</b>, as shown on our pricing page). Each plan includes a fixed number of report generations. Regenerating a report for a month you've already generated does not consume an additional report credit. Plan prices, inclusions, and durations may change for future purchases; changes do not apply retroactively to an active plan you've already paid for.
          </p>
        </Section>

        <Section n="4" title="Payments">
          <p>
            Payments are processed through <b>Cashfree Payments</b>, a licensed payment aggregator. We do not store your card, UPI, or bank details. All prices are in INR and inclusive of applicable GST, shown at checkout.
          </p>
        </Section>

        <Section n="5" title="Your data and uploaded files">
          <p>
            You upload Amazon reports containing your sales, returns, fees, and SKU-level data. This data is stored securely, used only for computing your P&amp;L and displaying it back to you, and never shared with any third party. See our Privacy statement for full details. You may request full deletion of your account and data by emailing <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a>.
          </p>
        </Section>

        <Section n="6" title="Accuracy of reports">
          <p>
            Seller Margin applies a consistent reconciliation methodology (order filtering, fee matching, cost calculations) to the files you provide. Report accuracy depends on the completeness and correctness of the files you upload and cost prices you enter. Seller Margin is a reconciliation tool, <b>not tax, accounting, or legal advice</b> — please verify figures before relying on them for statutory filings.
          </p>
        </Section>

        <Section n="7" title="Acceptable use">
          <ul className="list-disc list-inside space-y-2">
            <li>Don't attempt to circumvent report/plan limits through automated abuse, multiple accounts, or credential sharing intended to bypass per-seller licensing.</li>
            <li>Don't upload files you do not have the right to use.</li>
            <li>Don't attempt to reverse-engineer, scrape, or interfere with the Service's normal operation.</li>
          </ul>
        </Section>

        <Section n="8" title="Limitation of liability">
          <p>
            The Service is provided "as is." To the maximum extent permitted by law, Ahan's International is not liable for indirect, incidental, or consequential damages arising from use of the Service, including decisions made based on generated reports. Our total liability for any claim is limited to the amount you paid for the plan giving rise to the claim.
          </p>
        </Section>

        <Section n="9" title="Termination">
          <p>
            We may suspend or terminate access for violation of these Terms. You may stop using the Service at any time; see our <Link to="/refunds" className="text-primary underline">Refund &amp; Cancellation Policy</Link> for details on plan cancellation.
          </p>
        </Section>

        <Section n="10" title="Governing law">
          <p>
            These Terms are governed by the laws of India. Any disputes are subject to the exclusive jurisdiction of the courts of <b>Kolkata, India</b>.
          </p>
        </Section>

        <Section n="11" title="Changes to these Terms">
          <p>
            We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section n="12" title="Contact">
          <p>
            Questions about these Terms: <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a> or WhatsApp <b>+91 89108 71321</b>.
          </p>
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
