import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Check, Sparkles, Ticket, Zap } from "lucide-react";
import { toast } from "sonner";
import { load as loadCashfree } from "@cashfreepayments/cashfree-js";

export default function Upgrade() {
  const { user, refresh } = useAuth();
  const [plans, setPlans] = useState({});
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [payingPlan, setPayingPlan] = useState(null);

  useEffect(() => { api.get("/plans").then(r => setPlans(r.data.plans || {})); }, []);

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

  const buy = async (planId) => {
    setPayingPlan(planId);
    try {
      const r = await api.post("/payments/cf/create-order", { plan: planId });
      const cashfree = await loadCashfree({ mode: r.data.env === "production" ? "production" : "sandbox" });
      await cashfree.checkout({ paymentSessionId: r.data.payment_session_id, redirectTarget: "_modal" });
      const v = await api.get(`/payments/cf/verify/${r.data.order_id}`);
      if (v.data.paid) {
        toast.success("Payment successful — activation email sent!");
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

  return (
    <div className="p-10 max-w-4xl">
      <div className="label-caps mb-2">Activation</div>
      <h1 className="font-serif text-5xl tracking-tight mb-4">
        {paidActive ? "Extend your access" : "Unlock Seller Margin"}
      </h1>
      <p className="text-muted-foreground mb-10 max-w-2xl">
        Pay online via UPI / card / netbanking and get instant access — an activation code is also emailed to you as a receipt.
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border mb-10">
        {trial && (
          <div className="p-10 bg-card border-b md:border-b-0 md:border-r border-border">
            <div className="label-caps mb-4">Short trial</div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="font-serif text-5xl">₹{trial.price_inr}</div>
              <div className="text-sm text-muted-foreground">/ {trial.days} days</div>
            </div>
            <p className="text-sm text-muted-foreground mb-8">Full access for {trial.days} days — perfect to reconcile your first month.</p>
            <ul className="space-y-2 text-sm mb-8">
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>All P&amp;L features</li>
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Excel + PDF exports</li>
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>SKU cost library</li>
            </ul>
            <button onClick={() => buy("trial_10")} disabled={payingPlan !== null}
              className="btn-outline w-full" data-testid="buy-trial-btn">
              <Zap size={12} className="inline mr-2"/> {payingPlan === "trial_10" ? "Opening checkout…" : `Pay ₹${trial.price_inr}`}
            </button>
          </div>
        )}
        {annual && (
          <div className="p-10 bg-primary text-primary-foreground">
            <div className="label-caps mb-4 opacity-80">Best value</div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="font-serif text-5xl">₹{annual.price_inr}</div>
              <div className="opacity-70 text-sm">/ {annual.days} days</div>
            </div>
            <p className="opacity-80 mb-8 text-sm">One payment, an entire year — about ₹{(annual.price_inr / 12).toFixed(0)}/month.</p>
            <ul className="space-y-2 text-sm mb-8">
              <li className="flex gap-3"><Check size={14} className="text-accent shrink-0 mt-1"/>Everything in trial</li>
              <li className="flex gap-3"><Check size={14} className="text-accent shrink-0 mt-1"/>Full 12-month history</li>
              <li className="flex gap-3"><Check size={14} className="text-accent shrink-0 mt-1"/>Every future feature</li>
            </ul>
            <button onClick={() => buy("annual")} disabled={payingPlan !== null}
              className="bg-accent text-accent-foreground w-full py-4 font-medium text-sm uppercase tracking-[0.15em] hover:brightness-95 disabled:opacity-50"
              data-testid="buy-annual-btn">
              <Zap size={12} className="inline mr-2"/> {payingPlan === "annual" ? "Opening checkout…" : `Pay ₹${annual.price_inr}`}
            </button>
          </div>
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
