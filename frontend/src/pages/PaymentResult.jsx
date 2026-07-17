import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import api from "../lib/api";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sid = params.get("session_id");
  const [status, setStatus] = useState("polling");
  const { refresh } = useAuth();

  useEffect(() => {
    if (!sid) return;
    let tries = 0;
    const poll = async () => {
      try {
        const r = await api.get(`/payments/status/${sid}`);
        if (r.data.payment_status === "paid") {
          setStatus("paid");
          await refresh();
          return;
        }
        if (r.data.payment_status === "failed" || r.data.payment_status === "expired") {
          setStatus("failed"); return;
        }
      } catch {}
      if (tries++ < 15) setTimeout(poll, 2000);
      else setStatus("timeout");
    };
    poll();
  }, [sid]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-border bg-card p-12 text-center">
        {status === "polling" && <>
          <Loader2 size={40} className="mx-auto mb-6 text-primary animate-spin"/>
          <h1 className="font-serif text-3xl mb-3">Confirming payment…</h1>
          <p className="text-sm text-muted-foreground">Please wait while we verify with Stripe.</p>
        </>}
        {status === "paid" && <>
          <CheckCircle2 size={40} className="mx-auto mb-6 text-primary"/>
          <h1 className="font-serif text-3xl mb-3">You're on Lifetime</h1>
          <p className="text-sm text-muted-foreground mb-8">Thank you. Every month, every feature, forever.</p>
          <Link to="/dashboard" className="btn-emerald inline-block" data-testid="success-continue">Open dashboard</Link>
        </>}
        {(status === "failed" || status === "timeout") && <>
          <XCircle size={40} className="mx-auto mb-6 text-destructive"/>
          <h1 className="font-serif text-3xl mb-3">Payment not confirmed</h1>
          <p className="text-sm text-muted-foreground mb-8">If you were charged, refresh the page. Otherwise try again.</p>
          <Link to="/upgrade" className="btn-outline inline-block" data-testid="success-retry">Try again</Link>
        </>}
      </div>
    </div>
  );
}

export function PaymentCancel() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-border bg-card p-12 text-center">
        <h1 className="font-serif text-3xl mb-3">Checkout cancelled</h1>
        <p className="text-sm text-muted-foreground mb-8">No worries — you can upgrade anytime.</p>
        <Link to="/upgrade" className="btn-emerald inline-block" data-testid="cancel-try">Back to upgrade</Link>
      </div>
    </div>
  );
}
