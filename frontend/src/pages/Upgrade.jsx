import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Check, Sparkles, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function Upgrade() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);

  useEffect(() => { api.get("/plan").then(r => setPlan(r.data.package)); }, []);

  const checkout = async () => {
    setBusy(true);
    try {
      const r = await api.post("/payments/checkout", { origin_url: window.location.origin });
      window.location.href = r.data.checkout_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
      setBusy(false);
    }
  };

  const status = user?.status;
  const paidActive = status?.is_paid;

  return (
    <div className="p-10 max-w-3xl">
      <div className="label-caps mb-2">Upgrade</div>
      <h1 className="font-serif text-5xl tracking-tight mb-4">
        {paidActive ? "Renew your access" : "One payment. One year."}
      </h1>
      <p className="text-muted-foreground mb-10 max-w-lg">
        Unlock unlimited monthly reconciliations, PDF + Excel exports, cost-price library, and every future feature — for 365 days.
      </p>

      {paidActive && (
        <div className="border border-primary bg-primary/5 p-6 mb-8 flex items-center gap-4" data-testid="paid-active-banner">
          <Sparkles size={24} className="text-primary shrink-0"/>
          <div>
            <div className="font-serif text-xl">You're on Annual — {status.paid_days_left} day{status.paid_days_left === 1 ? "" : "s"} left</div>
            <div className="text-sm text-muted-foreground">Expires {status.paid_until ? new Date(status.paid_until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}. Buy another year now to extend.</div>
          </div>
        </div>
      )}

      <div className="border border-border bg-primary text-primary-foreground p-10">
        <div className="label-caps mb-4 opacity-80">Annual plan</div>
        <div className="flex items-baseline gap-2 mb-2">
          <div className="font-serif text-7xl">₹249</div>
          <div className="opacity-70 text-sm">/ year</div>
        </div>
        <div className="text-xs opacity-70 mb-8 flex items-center gap-2">
          <Calendar size={12}/> One payment · 365 days access · No auto-renew
        </div>
        <ul className="space-y-3 mb-10 text-sm">
          {["Unlimited monthly reports for 12 months",
            "Excel + PDF export",
            "SKU cost library (auto-remembered)",
            "Returns handling (SELLABLE overrides)",
            "Every feature added during your year — included"].map(x => (
            <li key={x} className="flex gap-3"><Check size={16} className="text-accent shrink-0 mt-0.5"/>{x}</li>
          ))}
        </ul>
        <button onClick={checkout} disabled={busy}
          className="bg-accent text-accent-foreground w-full py-4 font-medium text-sm uppercase tracking-[0.15em] hover:brightness-95 disabled:opacity-50"
          data-testid="checkout-btn">
          {busy ? "Redirecting…" : (paidActive ? "Renew for another year — ₹249" : "Pay & unlock 1 year")}
        </button>
        {plan && plan.currency === "usd" && (
          <div className="text-[11px] opacity-70 text-center mt-3">Charged in test mode as US$ {plan.amount.toFixed(2)} (Stripe India requires your own account key).</div>
        )}
      </div>
    </div>
  );
}
