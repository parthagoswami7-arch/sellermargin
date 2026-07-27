import React from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Mail, Phone, Clock, MapPin, ArrowLeft } from "lucide-react";
import { whatsappLink } from "../components/WhatsAppFab";

export default function ContactUs() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-[900px] mx-auto px-8 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="back-home">
            <img src="/brand/logo.png" alt="Seller Margin" className="h-8 w-8 object-contain"/>
            <span className="font-serif text-xl">Seller Margin</span>
          </Link>
          <Link to="/" className="btn-ghost text-xs"><ArrowLeft size={12} className="inline mr-2"/>Home</Link>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-20">
        <div className="label-caps mb-4">Contact us</div>
        <h1 className="font-serif text-5xl tracking-tight mb-6">Talk to a human.</h1>
        <p className="text-muted-foreground leading-relaxed mb-12 max-w-2xl">
          Questions before buying, help with a report, billing, GST invoice, or refund — reach us via any of the channels below. We usually reply within a few hours during India business hours.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border mb-12">
          <div className="p-8 border-b md:border-b-0 md:border-r border-border">
            <div className="w-12 h-12 rounded-full bg-[#25D366]/10 flex items-center justify-center mb-4">
              <MessageCircle size={20} className="text-[#25D366]" fill="#25D366"/>
            </div>
            <div className="label-caps mb-2">WhatsApp (fastest)</div>
            <div className="font-serif text-2xl mb-1">+91 89108 71321</div>
            <p className="text-sm text-muted-foreground mb-4">Screenshots, files, voice notes all welcome.</p>
            <a href={whatsappLink("Hi, I need help with Seller Margin.")} target="_blank" rel="noreferrer noopener"
              className="btn-emerald text-xs inline-block" data-testid="contact-wa-btn">Chat on WhatsApp</a>
          </div>
          <div className="p-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Mail size={20} className="text-primary"/>
            </div>
            <div className="label-caps mb-2">Email</div>
            <div className="font-serif text-2xl mb-1"><a href="mailto:support@sellermargin.in" className="hover:text-primary" data-testid="contact-email">support@sellermargin.in</a></div>
            <p className="text-sm text-muted-foreground mb-4">Best for billing, tax invoices, and formal queries.</p>
            <a href="mailto:support@sellermargin.in" className="btn-outline text-xs inline-block">Send email</a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border">
          <div className="p-6 border-b md:border-b-0 md:border-r border-border">
            <Clock size={16} className="text-primary mb-3"/>
            <div className="label-caps mb-2">Support hours</div>
            <div className="text-sm">Mon – Sat<br/>10:00 AM – 8:00 PM IST</div>
          </div>
          <div className="p-6 border-b md:border-b-0 md:border-r border-border">
            <Phone size={16} className="text-primary mb-3"/>
            <div className="label-caps mb-2">Phone (WhatsApp only)</div>
            <div className="text-sm font-mono">+91 89108 71321</div>
          </div>
          <div className="p-6">
            <MapPin size={16} className="text-primary mb-3"/>
            <div className="label-caps mb-2">Registered office</div>
            <div className="text-sm">Ahans International<br/>Kolkata, West Bengal, India</div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-xs text-muted-foreground">
          <p>Business name: <b>Ahans International</b> · GSTIN available on request via email. For grievance or escalation, mark your email subject with <span className="font-mono">GRIEVANCE</span> and we'll respond within 2 business days.</p>
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
