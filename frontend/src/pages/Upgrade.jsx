import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Check, Sparkles, Ticket, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function Upgrade() {
  const { user, refresh } = useAuth();
  const [plans, setPlans] = useState({});
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/plans").then(r => setPlans(r.data.plans || {})); }, []);

  const redeem = async () => {
    const clean = (code || "").trim().toUpperCase();
    if (!clean) return toast.error("Enter your activation code");
    setBusy(true);
    try {
      const r = await api.post("/codes/redeem", { code: clean });
      toast.success(`Unlocked ${r.data.plan.label} — expires ${new Date(r.data.paid_until).toLocaleDateString("en-IN")}`);
      setCode("");
      await refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Redeem failed");
    } finally { setBusy(false); }
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
        Purchase a code from the seller (WhatsApp / UPI) then paste it below. Each code is single-use and instantly extends your access.
      </p>

      {paidActive && (
        <div className="border border-primary bg-primary/5 p-6 mb-8 flex items-center gap-4" data-testid="paid-active-banner">
          <Sparkles size={24} className="text-primary shrink-0"/>
          <div>
            <div className="font-serif text-xl">You're active — {status.paid_days_left} day{status.paid_days_left === 1 ? "" : "s"} left</div>
            <div className="text-sm text-muted-foreground">Expires {status.paid_until ? new Date(status.paid_until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}. Redeem another code any time to add more days.</div>
          </div>
        </div>
      )}

      {/* Redeem card */}
      <div className="border border-border bg-primary text-primary-foreground p-10 mb-10">
        <div className="label-caps mb-4 opacity-80 flex items-center gap-2"><Ticket size={14}/> Enter activation code</div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="SM-XXXX-XXXX-XXXX"
            className="flex-1 bg-background text-foreground border-2 border-accent px-4 py-4 font-mono text-lg tracking-widest uppercase focus:outline-none"
            data-testid="code-input"/>
          <button onClick={redeem} disabled={busy}
            className="bg-accent text-accent-foreground px-8 py-4 font-medium text-sm uppercase tracking-[0.15em] hover:brightness-95 disabled:opacity-50"
            data-testid="redeem-btn">
            {busy ? "Redeeming…" : "Redeem"}
          </button>
        </div>
        <div className="text-[11px] opacity-70 mt-3">Code format: SM- followed by three 4-character groups.</div>
      </div>

      {/* Plans on offer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-border">
        {trial && (
          <div className="p-10 bg-card border-b md:border-b-0 md:border-r border-border">
            <div className="label-caps mb-4">Short trial</div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="font-serif text-5xl">₹{trial.price_inr}</div>
              <div className="text-sm text-muted-foreground">/ {trial.days} days</div>
            </div>
            <p className="text-sm text-muted-foreground mb-8">Full access for {trial.days} days — perfect to reconcile your first month and see the value.</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>All P&amp;L features</li>
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Excel + PDF exports</li>
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>SKU cost library</li>
            </ul>
          </div>
        )}
        {annual && (
          <div className="p-10 bg-card">
            <div className="label-caps mb-4">Best value</div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="font-serif text-5xl">₹{annual.price_inr}</div>
              <div className="text-sm text-muted-foreground">/ {annual.days} days</div>
            </div>
            <p className="text-sm text-muted-foreground mb-8">One payment, an entire year — that's ₹{(annual.price_inr / 12).toFixed(0)}/month.</p>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Everything in trial</li>
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Full 12-month history</li>
              <li className="flex gap-3"><Check size={14} className="text-primary shrink-0 mt-1"/>Every future feature</li>
            </ul>
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground mt-8">
        Don't have a code yet? Contact the seller on WhatsApp for a UPI payment link — they'll send you the code instantly.
      </div>
    </div>
  );
}
