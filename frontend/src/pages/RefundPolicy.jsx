import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageCircle } from "lucide-react";
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
        <p className="text-sm text-muted-foreground mb-10">Effective from 27 February 2026 · Last updated 27 February 2026</p>

        <p className="text-[15px] leading-relaxed text-muted-foreground mb-12">
          Seller Margin is a digital service that generates reports immediately upon use. Because reports are usually consumed within minutes of purchase, our refund policy reflects the nature of instantly-delivered digital services.
        </p>

        <Section title="1. Trial and annual plans">
          <p>
            We offer a low-cost <b>7-day / 1-report trial plan</b> specifically so you can evaluate the Service with your own real Amazon data before committing to the annual plan. We encourage using the trial to confirm the Service meets your needs prior to purchasing the annual plan.
          </p>
        </Section>

        <Section title="2. When a refund is available">
          <p>We will issue a full refund if:</p>
          <ul className="list-disc list-inside space-y-2 mt-2">
            <li>A technical fault on our end prevents you from generating any report at all during your plan period, and our support team is unable to resolve it within a reasonable time; or</li>
            <li>You were charged twice for the same purchase due to a payment processing error.</li>
          </ul>
          <p>
            To request a refund under these conditions, contact <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a> within 7 days of the charge, with your registered email and a description of the issue. Approved refunds are processed to the original payment method within <b>5–7 business days</b> via Cashfree.
          </p>
        </Section>

        <Section title="3. When a refund is not available">
          <ul className="list-disc list-inside space-y-2">
            <li>Change of mind after successfully generating one or more reports.</li>
            <li>Dissatisfaction with reconciliation figures resulting from incomplete, incorrect, or improperly formatted files you uploaded.</li>
            <li>Not using the plan's report credits before they are needed (unused report credits do not expire within an active annual plan but are non-refundable for cash value).</li>
          </ul>
        </Section>

        <Section title="4. Cancellation">
          <p>
            Since plans are one-time purchases for a fixed duration (7 days or 1 year) rather than auto-renewing subscriptions, there is no recurring charge to cancel. Your access simply ends at the end of the purchased period unless you buy a new plan.
          </p>
        </Section>

        <Section title="5. Contact">
          <p>
            For any refund or cancellation request: <a href="mailto:support@sellermargin.in" className="text-primary underline">support@sellermargin.in</a> or WhatsApp <b>+91 89108 71321</b>, Mon–Sat, 10 AM–8 PM IST.
          </p>
        </Section>

        <div className="border border-primary bg-primary/5 p-8 mt-12 flex items-start gap-4">
          <MessageCircle size={22} className="text-primary shrink-0 mt-1"/>
          <div>
            <div className="font-serif text-xl mb-2">Need to reach us about a refund?</div>
            <p className="text-sm text-muted-foreground mb-4">Fastest way is WhatsApp — we handle refund queries personally.</p>
            <a href={whatsappLink("Hi, I have a refund query regarding a Seller Margin purchase. My registered email is —")}
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
