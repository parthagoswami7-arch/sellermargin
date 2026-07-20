import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Check, Sparkles, Ticket, Zap, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { load as loadCashfree } from "@cashfreepayments/cashfree-js";

const GST_PCT = 18;

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
  const [plans, setPlans] = useState({});
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [payingPlan, setPayingPlan] = useState(null);

  // Seller (from backend settings) — used for intra/inter-state GST logic
  const [seller, setSeller] = useState({ state: "Maharashtra", business_name: "" });
  const [states, setStates] = useState([]);

  // GST invoice form (optional)
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [gForm, setGForm] = useState({
    buyer_name: "", buyer_gstin: "", buyer_billing_address: "", buyer_state: "",
  });

  useEffect(() => {
    api.get("/plans").then(r => setPlans(r.data.plans || {}));
    api.get("/settings/seller").then(r => setSeller(r.data.seller || {})).catch(() => {});
    api.get("/settings/india-states").then(r => setStates(r.data.states || [])).catch(() => {});
  }, []);

  const redeem = async () => {
    const clean = (code || "").trim().toUpperCase();
    if (!clean) return toast.error("Enter your activation code");
    setBusy(true);
    try {
      const r = await api.post("/codes/redeem", { code: clean });
      toast.success(`Unlocked ${r.data.plan.label} — expires ${new Date(r.data.paid_until).toLocaleDateString("en-IN")}`);
      setCode(""); await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Redeem failed");
    } finally { setBusy(false); }
  };

  const buy = async (planId, planBase) => {
    // Client-side validation only when the buyer opted in for a GST invoice
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
      await cashfree.checkout({ paymentSessionId: r.data.payment_session_id, redirectTarget: "_modal" });
      const v = await api.get(`/payments/cf/verify/${r.data.order_id}`);
      if (v.data.paid) {
        toast.success("Payment successful — activation email + tax invoice sent!");
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
  const trialGst  = trial  ? computeGst(trial.price_inr,  gForm.buyer_state, seller.state) : null;
  const annualGst = annual ? computeGst(annual.price_inr, gForm.buyer_state, seller.state) : null;

  return (
    <div className="p-10 max-w-4xl">
      <div className="label-caps mb-2">Activation</div>
      <h1 className="font-serif text-5xl tracking-tight mb-4">
        {paidActive ? "Extend your access" : "Unlock Seller Margin"}
      </h1>
      <p className="text-muted-foreground mb-10 max-w-2xl">
        Pay online via UPI / card / netbanking and get instant access — an activation code and a GST-compliant tax invoice are emailed to you.
      </p>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border mb-10">
        {trial && (
          <PlanCard
            title="Short trial" muted
            plan={trial} gst={trialGst}
            payingPlan={payingPlan}
            onBuy={() => buy("trial_10", trial.price_inr)}
            testid="buy-trial-btn"
          />
        )}
        {annual && (
          <PlanCard
            title="Best value" primary
            plan={annual} gst={annualGst}
            payingPlan={payingPlan}
            onBuy={() => buy("annual", annual.price_inr)}
            testid="buy-annual-btn"
          />
        )}
      </div>

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

function PlanCard({ title, muted, primary, plan, gst, payingPlan, onBuy, testid }) {
  const isPaying = payingPlan === plan.id;
  const anyPaying = payingPlan !== null;
  const rupee = (v) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className={`p-10 ${primary ? "bg-primary text-primary-foreground" : "bg-card border-b md:border-b-0 md:border-r border-border"}`}>
      <div className={`label-caps mb-4 ${primary ? "opacity-80" : ""}`}>{title}</div>
      <div className="flex items-baseline gap-2 mb-1">
        <div className="font-serif text-5xl">₹{plan.price_inr}</div>
        <div className={`text-sm ${primary ? "opacity-70" : "text-muted-foreground"}`}>+ 18% GST</div>
      </div>
      <div className={`text-xs mb-6 ${primary ? "opacity-70" : "text-muted-foreground"}`}>
        for {plan.days} days
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
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>All P&amp;L features</li>
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>Excel + PDF exports</li>
        <li className="flex gap-3"><Check size={14} className={`shrink-0 mt-1 ${primary ? "text-accent" : "text-primary"}`}/>SKU cost library</li>
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

function Row({ label, value, bold, primary }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`${primary ? "opacity-80" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? "font-bold text-sm" : ""}`}>{value}</span>
    </div>
  );
}
