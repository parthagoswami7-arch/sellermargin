import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Check, Sparkles, Ticket, Zap, FileText, ChevronDown, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { load as loadCashfree } from "@cashfreepayments/cashfree-js";
import { whatsappLink } from "../components/WhatsAppFab";

function computeGst(basePrice, buyerState, sellerState) {
  const base = Number(basePrice) || 0;
  const intra = !buyerState || (buyerState.trim().toLowerCase() === (sellerState || "").trim().toLowerCase());
  if (intra) {
    const cgst = +(base * 0.09).toFixed(2);
    const sgst = +(base * 0.09).toFixed(2);
    const tax = +(cgst + sgst).toFixed(2);
    return { base, intra, cgst, sgst, igst: 0, tax, total: +(base + tax).toFixed(2) };
  }
  const igst = +(base * 0.18).toFixed(2);
  return { base, intra, cgst: 0, sgst: 0, igst, tax: igst, total: +(base + igst).toFixed(2) };
}

export default function Upgrade() {
  const { user, refresh } = useAuth();
  const [sp] = useSearchParams();
  const highlightTopup = sp.get("highlight") === "topup";
  const [plans, setPlans] = useState({});
  const [upcoming, setUpcoming] = useState({});
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [payingPlan, setPayingPlan] = useState(null);

  const [seller, setSeller] = useState({ state: "Maharashtra", business_name: "" });
  const [states, setStates] = useState([]);

  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [gForm, setGForm] = useState({
    buyer_name: "", buyer_gstin: "", buyer_billing_address: "", buyer_state: "",
  });

  useEffect(() => {
    api.get("/plans").then(r => { setPlans(r.data.plans || {}); setUpcoming(r.data.upcoming_plans || {}); });
    api.get("/settings/seller").then(r => setSeller(r.data.seller || {})).catch(() => {});
    api.get("/settings/india-states").then(r => setStates(r.data.states || [])).catch(() => {});
  }, []);

  const redeem = async () => {
    const clean = (code || "").trim().toUpperCase();
    if (!clean) return toast.error("Enter your activation code");
    setBusy(true);
    try {
      const r = await api.post("/codes/redeem", { code: clean });
      const added = r.data.reports_added || 0;
      toast.success(`Unlocked ${r.data.plan.label} — +${added} report${added === 1 ? "" : "s"} added, expires ${new Date(r.data.paid_until).toLocaleDateString("en-IN")}`);
      setCode(""); await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Redeem failed");
    } finally { setBusy(false); }
  };

  const buy = async (planId) => {
    if (wantsInvoice) {
      if (!gForm.buyer_name.trim()) return toast.error("Business/individual name is required for a GST invoice");
      if (!gForm.buyer_state) return toast.error("Please pick your state (for CGST/SGST vs IGST)");
    }
    setPayingPlan(planId);
    try {
      const payload = {
        plan: planId,
        wants_invoice: wantsInvoice,
        buyer_name: wantsInvoice ? gForm.buyer_name.trim() : (user?.name || null),
        buyer_gstin: wantsInvoice ? (gForm.buyer_gstin || "").trim().toUpperCase() : null,
        buyer_billing_address: wantsInvoice ? gForm.buyer_billing_address.trim() : null,
        buyer_state: wantsInvoice ? gForm.buyer_state : null,
      };
      const r = await api.post("/payments/cf/create-order", payload);
      const cashfree = await loadCashfree({ mode: r.data.env === "production" ? "production" : "sandbox" });
      const cfResult = await cashfree.checkout({ paymentSessionId: r.data.payment_session_id, redirectTarget: "_modal" });
      // Cashfree checkout returns an object like {error, order} — surface errors clearly
      if (cfResult?.error) {
        const msg = String(cfResult.error?.message || cfResult.error || "");
        if (/whitelist|not enabled|not approved|broken link/i.test(msg)) {
          toast.error("This domain isn't whitelisted in Cashfree yet. Ask the admin to whitelist it at merchant.cashfree.com > Developers > Whitelisting.", { duration: 12000 });
        } else if (/cancel|closed|abort/i.test(msg)) {
          toast.error("Payment cancelled. Try again when ready.");
        } else {
          toast.error(`Cashfree: ${msg}`);
        }
        return;
      }
      const v = await api.get(`/payments/cf/verify/${r.data.order_id}`);
      if (v.data.paid) {
        toast.success("Payment successful — reports added + activation email sent!");
        await refresh();
      } else {
        toast.error(`Payment status: ${v.data.status || "pending"}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.message || "Payment failed");
    } finally { setPayingPlan(null); }
  };

  const status = user?.status;
  const paidActive = status?.is_paid;
  const trial = plans.trial_10;
  const annual = plans.annual;
  const topup = plans.topup_5;
  const agency = upcoming.agency_starter;
  const trialGst  = trial  ? computeGst(trial.price_inr,  gForm.buyer_state, seller.state) : null;
  const annualGst = annual ? computeGst(annual.price_inr, gForm.buyer_state, seller.state) : null;
  const topupGst  = topup  ? computeGst(topup.price_inr,  gForm.buyer_state, seller.state) : null;

  return (
    <div className="p-10 max-w-6xl">
      <div className="label-caps mb-2">Activation</div>
      <h1 className="font-serif text-5xl tracking-tight mb-4">
        {paidActive ? "Extend your access" : "Unlock Seller Margin"}
      </h1>
      <p className="text-muted-foreground mb-10 max-w-2xl">
        Pay online via UPI / card / netbanking. You get instant access, a GST tax invoice, and an activation code emailed to you.
      </p>

      {/* Current usage — appears only when user is logged in and status is available */}
      {status && !status.reports_unlimited && (
        <div className="border border-border bg-card p-6 mb-10 flex flex-wrap items-center gap-6" data-testid="reports-usage">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-primary"/>
            <div>
              <div className="text-2xl font-serif tabular-nums">
                <span className={status.reports_remaining === 0 ? "text-destructive" : ""}>{status.reports_remaining}</span>
                <span className="text-muted-foreground text-lg"> / {status.reports_quota}</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Reports remaining</div>
            </div>
          </div>
          <div className="border-l border-border pl-6">
            <div className="text-sm text-muted-foreground">Used {status.reports_used} · Quota {status.reports_quota}</div>
            <div className="text-xs text-muted-foreground mt-1">1 report = one calendar month · regenerating the same month is free</div>
          </div>
        </div>
      )}

      {paidActive && (
        <div className="border border-primary bg-primary/5 p-6 mb-8 flex items-center gap-4" data-testid="paid-active-banner">
          <Sparkles size={24} className="text-primary shrink-0"/>
          <div>
            <div className="font-serif text-xl">You're active — {status.paid_days_left} day{status.paid_days_left === 1 ? "" : "s"} left</div>
            <div className="text-sm text-muted-foreground">Expires {status.paid_until ? new Date(status.paid_until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}.</div>
          </div>
        </div>
      )}

      {/* GST invoice details (optional) */}
      <div className="border border-border bg-card mb-10" data-testid="gst-section">
        <button onClick={() => setWantsInvoice(v => !v)} data-testid="gst-toggle"
          className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-muted/40 transition-colors">
          <div className={`w-6 h-6 border-2 flex items-center justify-center shrink-0 transition-colors ${wantsInvoice ? "bg-primary border-primary" : "border-border"}`}>
            {wantsInvoice && <Check size={14} className="text-primary-foreground" strokeWidth={3}/>}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-primary"/>
              <div className="font-medium">I want a GST tax invoice (Input Tax Credit)</div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Optional. If unchecked, we still issue a bill of supply — GST is charged either way.
            </div>
          </div>
          <ChevronDown size={16} className={`text-muted-foreground transition-transform ${wantsInvoice ? "rotate-180" : ""}`}/>
        </button>
        {wantsInvoice && (
          <div className="px-6 pb-6 pt-2 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="gst-form">
            <div className="md:col-span-2">
              <label className="label-caps block mb-1">Business / Individual name</label>
              <input value={gForm.buyer_name} onChange={e => setGForm({ ...gForm, buyer_name: e.target.value })}
                placeholder="Acme Traders LLP" data-testid="gst-name"
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
            </div>
            <div>
              <label className="label-caps block mb-1">GSTIN <span className="text-muted-foreground normal-case tracking-normal text-[10px]">(optional — leave blank if unregistered)</span></label>
              <input value={gForm.buyer_gstin}
                onChange={e => setGForm({ ...gForm, buyer_gstin: e.target.value.toUpperCase() })}
                maxLength={15} placeholder="27AAAAA0000A1Z5" data-testid="gst-gstin"
                className="w-full border border-border bg-background px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"/>
            </div>
            <div>
              <label className="label-caps block mb-1">State <span className="text-destructive normal-case tracking-normal">*</span></label>
              <select value={gForm.buyer_state} onChange={e => setGForm({ ...gForm, buyer_state: e.target.value })}
                data-testid="gst-state"
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select your state…</option>
                {states.map(s => <option key={s.code} value={s.name}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label-caps block mb-1">Billing address</label>
              <textarea rows={2} value={gForm.buyer_billing_address}
                onChange={e => setGForm({ ...gForm, buyer_billing_address: e.target.value })}
                placeholder="Street, city, PIN" data-testid="gst-address"
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"/>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border mb-6">
        {trial && (
          <PlanCard title="7-day trial" plan={trial} gst={trialGst}
            payingPlan={payingPlan} onBuy={() => buy("trial_10")}
            testid="buy-trial-btn"/>
        )}
        {annual && (
          <PlanCard title="Best value" primary plan={annual} gst={annualGst}
            payingPlan={payingPlan} onBuy={() => buy("annual")}
            testid="buy-annual-btn"/>
        )}
        {agency && <AgencyComingSoonCard plan={agency}/>}
      </div>

      {/* Top-up strip — flexible add-on */}
      {topup && (
        <div id="topup" className={`border p-6 mb-10 flex flex-wrap items-center gap-6 transition-all ${
          highlightTopup ? "border-accent bg-accent/10 shadow-lg" : "border-border bg-card"
        }`} data-testid="topup-card">
          <div className="flex items-center gap-4 flex-1 min-w-[280px]">
            <div className="w-12 h-12 border-2 border-primary bg-primary/5 flex items-center justify-center shrink-0">
              <Plus size={20} className="text-primary"/>
            </div>
            <div>
              <div className="label-caps mb-1">Need more reports?</div>
              <div className="font-serif text-2xl">5 extra reports · ₹249 <span className="text-sm text-muted-foreground font-sans">+ 18% GST</span></div>
              <div className="text-xs text-muted-foreground mt-1">Adds 5 to your existing balance · doesn't extend your access period{topupGst && <> · <b>total ₹{topupGst.total.toFixed(2)}</b></>}</div>
            </div>
          </div>
          <button onClick={() => buy("topup_5")} disabled={payingPlan !== null}
            className="btn-emerald px-6" data-testid="buy-topup-btn">
            <Zap size={12} className="inline mr-2"/>
            {payingPlan === "topup_5" ? "Opening checkout…" : `Buy top-up · ₹${topupGst ? topupGst.total.toFixed(2) : topup.price_inr}`}
          </button>
        </div>
      )}

      <div className="border border-border bg-card p-8">
        <div className="label-caps mb-4 flex items-center gap-2"><Ticket size={14}/> Have an activation code?</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="SM-XXXX-XXXX-XXXX"
            className="flex-1 border-2 border-border bg-background px-4 py-3 font-mono text-base tracking-widest uppercase focus:outline-none focus:border-primary"
            data-testid="code-input"/>
          <button onClick={redeem} disabled={busy} className="btn-emerald px-6" data-testid="redeem-btn">
            {busy ? "Redeeming…" : "Redeem"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ title, primary, plan, gst, payingPlan, onBuy, testid }) {
  const isPaying = payingPlan === plan.id;
  const anyPaying = payingPlan !== null;
  const rupee = (v) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const quota = plan.reports_quota || 0;
  const hasDiscount = plan.list_price_inr && plan.list_price_inr > plan.price_inr;
  const savings = hasDiscount ? plan.list_price_inr - plan.price_inr : 0;

  return (
    <div className={`p-10 relative ${primary ? "bg-primary text-primary-foreground" : "bg-card border-b md:border-b-0 md:border-r border-border"}`}>
      {hasDiscount && (
        <div className="absolute top-3 right-3 bg-accent text-accent-foreground text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-1" data-testid={`fomo-${plan.id}`}>
          Save ₹{savings}
        </div>
      )}
      <div className={`label-caps mb-4 ${primary ? "opacity-80" : ""}`}>{title}</div>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <div className="font-serif text-5xl">₹{plan.price_inr}</div>
        {hasDiscount && (
          <div className={`text-xl line-through font-serif ${primary ? "opacity-60" : "text-muted-foreground"}`} data-testid={`strike-${plan.id}`}>
            ₹{plan.list_price_inr}
          </div>
        )}
        <div className={`text-sm ${primary ? "opacity-70" : "text-muted-foreground"}`}>+ 18% GST</div>
      </div>
      <div className={`text-xs mb-1 ${primary ? "opacity-70" : "text-muted-foreground"}`}>
        for {plan.days} days
      </div>
      {hasDiscount && (
        <div className={`text-[11px] uppercase tracking-[0.15em] font-bold mb-4 ${primary ? "text-accent" : "text-primary"}`}>
          ⚡ Launch offer · limited time
        </div>
      )}

      {/* Report quota chip */}
      <div className={`flex items-center gap-2 mb-6 mt-3 px-3 py-2 text-sm border ${primary ? "border-primary-foreground/30 bg-primary-foreground/10" : "border-accent bg-accent/10 text-foreground"}`}>
        <Package size={14} className={primary ? "text-accent" : "text-primary"}/>
        <span><b>{quota}</b> report{quota === 1 ? "" : "s"} included</span>
      </div>

      {/* GST breakdown */}
      {gst && (
        <div className={`text-xs space-y-1 mb-6 pb-6 border-b ${primary ? "border-primary-foreground/20 opacity-90" : "border-border"}`} data-testid={`breakdown-${plan.id}`}>
          <Row label="Subtotal" value={rupee(gst.base)} primary={primary}/>
          {gst.intra ? (<>
            <Row label={`CGST @ 9%`}    value={rupee(gst.cgst)} primary={primary}/>
            <Row label={`SGST @ 9%`}    value={rupee(gst.sgst)} primary={primary}/>
          </>) : (
            <Row label={`IGST @ 18%`}   value={rupee(gst.igst)} primary={primary}/>
          )}
          <Row label="Total payable"   value={rupee(gst.total)} bold primary={primary}/>
        </div>
      )}

      <ul className="space-y-2 text-sm mb-8">
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>Reconcile {quota} calendar month{quota === 1 ? "" : "s"}</li>
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>Free regeneration of same month</li>
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>Unused reports carry forward on renewal</li>
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>GST tax invoice on email</li>
      </ul>

      <button onClick={onBuy} disabled={anyPaying} data-testid={testid}
        className={primary
          ? "bg-accent text-accent-foreground w-full py-4 font-medium text-sm uppercase tracking-[0.15em] hover:brightness-95 disabled:opacity-50"
          : "btn-outline w-full"}>
        <Zap size={12} className="inline mr-2"/>
        {isPaying ? "Opening checkout…" : `Pay ${gst ? rupee(gst.total) : `₹${plan.price_inr}`}`}
      </button>
    </div>
  );
}

function AgencyComingSoonCard({ plan }) {
  const total = +(plan.price_inr * 1.18).toFixed(2);
  return (
    <div className="p-10 bg-card relative" data-testid="agency-card">
      <div className="absolute top-3 right-3 bg-accent text-accent-foreground text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-1">Coming soon</div>
      <div className="label-caps mb-4">{plan.label}</div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="font-serif text-5xl">₹{plan.price_inr.toLocaleString("en-IN")}</div>
        <div className="text-sm text-muted-foreground">+ 18% GST</div>
      </div>
      <div className="text-xs mb-4 text-muted-foreground">≈ ₹{total.toLocaleString("en-IN")} all-in · about ₹{Math.round(plan.price_inr / plan.reports_quota)}/report</div>
      <div className="flex items-center gap-2 mb-6 px-3 py-2 text-sm border border-border bg-muted/40">
        <Package size={14} className="text-primary"/>
        <span><b>{plan.reports_quota}</b> reports · 5 sellers × 12 months</span>
      </div>
      <ul className="space-y-2 text-sm mb-8 text-muted-foreground">
        <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>{plan.tagline}</li>
        <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Priority WhatsApp support</li>
        <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Bulk import cost prices</li>
      </ul>
      <a href={whatsappLink(`Hi, I'm interested in the ${plan.label} plan (${plan.reports_quota} reports/year). Please let me know when it launches.`)}
         target="_blank" rel="noreferrer noopener"
         className="btn-outline w-full text-center block" data-testid="agency-notify-btn">
        Notify me on WhatsApp
      </a>
    </div>
  );
}

function Row({ label, value, bold, primary }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`${primary ? "opacity-80" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? "font-bold text-sm" : ""}`}>{value}</span>
    </div>
  );
}
