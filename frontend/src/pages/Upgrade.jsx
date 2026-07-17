import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function Upgrade() {
  const { user, refresh } = useAuth();
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

  if (user?.status?.is_paid) {
    return (
      <div className="p-10 max-w-3xl">
        <div className="border border-primary bg-primary/5 p-10 text-center">
          <Sparkles size={32} className="mx-auto mb-4 text-primary"/>
          <h1 className="font-serif text-4xl mb-2">You're on Lifetime</h1>
          <p className="text-muted-foreground">Thank you! Enjoy unlimited monthly reconciliations, forever.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-3xl">
      <div className="label-caps mb-2">Upgrade</div>
      <h1 className="font-serif text-5xl tracking-tight mb-4">One payment. Forever.</h1>
      <p className="text-muted-foreground mb-10 max-w-lg">
        Unlock unlimited monthly reconciliations, PDF + Excel exports, cost-price library, and every future feature.
      </p>

      <div className="border border-border bg-primary text-primary-foreground p-10">
        <div className="label-caps mb-4 opacity-80">Lifetime plan</div>
        <div className="flex items-baseline gap-4 mb-8">
          <div className="font-serif text-7xl">₹249</div>
          <div className="opacity-70 text-sm">one-time</div>
        </div>
        <ul className="space-y-3 mb-10 text-sm">
          {["Unlimited monthly reports", "Excel + PDF export", "SKU cost library (auto-remembered)",
            "Returns handling (SELLABLE overrides)", "Every future feature included"].map(x => (
            <li key={x} className="flex gap-3"><Check size={16} className="text-accent shrink-0 mt-0.5"/>{x}</li>
          ))}
        </ul>
        <button onClick={checkout} disabled={busy}
          className="bg-accent text-accent-foreground w-full py-4 font-medium text-sm uppercase tracking-[0.15em] hover:brightness-95 disabled:opacity-50"
          data-testid="checkout-btn">
          {busy ? "Redirecting…" : "Pay & unlock lifetime"}
        </button>
        {plan && plan.currency === "usd" && (
          <div className="text-[11px] opacity-70 text-center mt-3">Charged in test mode as US$ {plan.amount.toFixed(2)} (Stripe India requires your own account key).</div>
        )}
      </div>
    </div>
  );
}
