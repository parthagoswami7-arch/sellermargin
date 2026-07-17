import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Upload, Calculator, FileDown, ShieldCheck, Sparkles, Package, TrendingUp, IndianRupee } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
function loginWithGoogle() {
  const redirectUrl = window.location.origin + "/dashboard";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

export default function Landing() {
  const { user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <nav className="border-b border-border bg-background">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="font-serif text-2xl leading-none tracking-tight">
            Ledger<span className="text-primary">.</span>
            <span className="ml-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground align-middle">Amazon P&amp;L</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#how-it-works" className="btn-ghost hidden md:inline-block" data-testid="nav-how">How it works</a>
            <a href="#pricing" className="btn-ghost hidden md:inline-block" data-testid="nav-pricing">Pricing</a>
            {user ? (
              <button onClick={() => nav("/dashboard")} className="btn-emerald" data-testid="cta-open-dashboard">
                Open dashboard <ArrowRight size={14} className="inline ml-2" />
              </button>
            ) : (
              <button onClick={loginWithGoogle} className="btn-emerald" data-testid="cta-signin-nav">
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-7 animate-fade-up">
            <div className="label-caps mb-6">Est. 2026 · For Amazon Sellers</div>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight font-medium mb-8">
              Your monthly Amazon P&amp;L,<br />
              <span className="italic text-primary">reconciled in minutes.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              Upload six reports from Seller Central. We handle the VLOOKUPs, pivot tables and fee reconciliation.
              You get a clean profit statement, per-SKU cost tracking and audit-ready Excel + PDF exports.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={user ? () => nav("/dashboard") : loginWithGoogle}
                className="btn-emerald text-base" data-testid="cta-hero-primary">
                {user ? "Open dashboard" : "Start 15-day free trial"} <ArrowRight size={16} className="inline ml-2" />
              </button>
              <a href="#how-it-works" className="btn-outline text-base" data-testid="cta-hero-secondary">See how it works</a>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <div className="flex items-center gap-2"><ShieldCheck size={14}/> No credit card</div>
              <div className="flex items-center gap-2"><Sparkles size={14}/> Auto-detects file types</div>
              <div className="flex items-center gap-2"><IndianRupee size={14}/> ₹249 lifetime — no subscription</div>
            </div>
          </div>

          <div className="lg:col-span-5 border border-border bg-card p-8 animate-fade-up">
            <div className="label-caps mb-4">Sample monthly summary</div>
            <div className="space-y-3 num">
              {[
                ["Settlement", "₹ 6,84,320.10"],
                ["Reimbursements", "₹ 12,400.00"],
                ["COGS", "-₹ 2,15,882.40"],
                ["FBA Storage fee", "-₹ 1,245.00"],
                ["Ad spend", "-₹ 45,120.00"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-border py-2 text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between pt-4">
                <span className="text-xs uppercase tracking-[0.2em] font-bold">Final Profit</span>
                <span className="text-3xl font-serif text-primary">₹ 4,34,472.70</span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground uppercase tracking-[0.15em] pt-2">
                <div>ACOS 6.60%</div>
                <div>Profit% 63.4%</div>
                <div>Return% 3.1%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-b border-border bg-card/40">
        <div className="max-w-[1400px] mx-auto px-8 py-24">
          <div className="mb-16">
            <div className="label-caps mb-4">How it works</div>
            <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">Three steps. Zero spreadsheets.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border">
            {[
              { icon: Upload, num: "01", title: "Drop six reports", body: "All Orders, Settlement, FBA Returns, Easy Ship Returns, FBA Removal, Sponsored Products. We auto-detect each file — no naming, no ordering." },
              { icon: Calculator, num: "02", title: "Set cost prices", body: "Enter unit cost for every SKU once. We remember them month over month. For sellable returns, override the cost with your repackaging fee." },
              { icon: FileDown, num: "03", title: "Get your P&L", body: "Instant dashboard with Revenue, COGS, fees, Ad spend, and Final Profit. Export a shareable PDF or the full Excel workbook." },
            ].map((s, i) => (
              <div key={s.num} className={`p-10 ${i < 2 ? "border-r border-border" : ""} bg-background`}>
                <div className="font-mono text-sm text-accent mb-4">{s.num}</div>
                <s.icon size={24} strokeWidth={1.5} className="mb-6 text-primary" />
                <h3 className="font-serif text-2xl mb-3">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features / for who */}
      <section className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-24 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <div className="label-caps mb-4">Built for Indian Amazon sellers</div>
            <h2 className="font-serif text-4xl sm:text-5xl tracking-tight mb-6">Every rupee accounted for.</h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              We follow the exact reconciliation logic tax consultants use for Indian Amazon sellers — including
              the FBA storage fee that Amazon posts on the 7th of the following month, and the SELLABLE-vs-DAMAGED
              cost adjustment for returns.
            </p>
            <ul className="space-y-3 text-sm">
              {["FBA + Easy Ship + MFN in one view", "Sellable returns keep their re-sell value",
                "Cancelled & Non-Amazon orders auto-excluded", "Per-SKU cost library reused every month",
                "Excel + PDF export in one click"].map(f => (
                <li key={f} className="flex gap-3"><TrendingUp size={16} className="text-primary shrink-0 mt-0.5"/>{f}</li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-7 border border-border">
            <img src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1400&q=80"
              alt="Warehouse" className="w-full h-[420px] object-cover" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-24">
          <div className="mb-16">
            <div className="label-caps mb-4">Pricing</div>
            <h2 className="font-serif text-4xl sm:text-5xl tracking-tight">One price. Forever.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
            <div className="p-12 bg-card border-r border-border">
              <div className="label-caps mb-4">15-day free trial</div>
              <div className="font-serif text-6xl mb-2">₹0</div>
              <p className="text-muted-foreground mb-8">Everything included. No credit card.</p>
              <button onClick={user ? () => nav("/dashboard") : loginWithGoogle}
                className="btn-outline w-full" data-testid="cta-pricing-trial">
                {user ? "Open dashboard" : "Start free trial"}
              </button>
            </div>
            <div className="p-12 bg-primary text-primary-foreground">
              <div className="label-caps mb-4 opacity-80">Lifetime access</div>
              <div className="font-serif text-6xl mb-2">₹249</div>
              <p className="opacity-80 mb-8">One-time payment. Every future month, forever.</p>
              <button onClick={user ? () => nav("/upgrade") : loginWithGoogle}
                className="bg-accent text-accent-foreground w-full py-3 font-medium text-sm uppercase tracking-[0.15em] hover:brightness-95"
                data-testid="cta-pricing-lifetime">
                Get lifetime access
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 text-center text-xs text-muted-foreground">
        <div>© 2026 Ledger — Amazon P&amp;L Reconciliation. Made with care for sellers.</div>
      </footer>
    </div>
  );
}
