import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { money } from "../lib/api";
import { ArrowRight, ArrowLeft, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

export default function ReturnsStep() {
  const { id } = useParams();
  const nav = useNavigate();
  const [returns, setReturns] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await api.get(`/reports/${id}/returns`);
      setReturns((r.data.returns || []).map(x => ({ ...x, override: x.cost_price_unit_override })));
    })();
  }, [id]);

  const setOverride = (order_id, v) =>
    setReturns(prev => prev.map(r => r.order_id === order_id ? { ...r, override: v } : r));

  const save = async () => {
    setSaving(true);
    try {
      const items = returns.map(r => ({
        order_id: r.order_id,
        cost_price_unit_override: r.override === "" || r.override === null || r.override === undefined ? null : Number(r.override),
      }));
      await api.post(`/reports/${id}/return-overrides`, items);
      const fin = await api.post(`/reports/${id}/finalize`);
      toast.success("Report finalized");
      nav(`/report/${id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Finalize failed");
    } finally { setSaving(false); }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await api.post(`/reports/${id}/finalize`);
      nav(`/report/${id}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-10 max-w-[1200px]">
      <div className="label-caps mb-2">Step 3 of 4</div>
      <h1 className="font-serif text-5xl tracking-tight mb-2">Returns review</h1>
      <p className="text-muted-foreground mb-6">
        For <span className="font-medium text-foreground">SELLABLE</span> returns, replace the cost price with your repackaging fee.
        For <span className="font-medium text-foreground">DAMAGED / DEFECTIVE</span> returns, keep the full unit cost.
      </p>

      {returns.length === 0 ? (
        <div className="border border-border p-16 text-center bg-card">
          <Info size={32} strokeWidth={1.5} className="mx-auto mb-4 text-primary"/>
          <div className="font-serif text-2xl mb-2">No returns this month</div>
          <p className="text-muted-foreground mb-8">Nothing to review — you're all set.</p>
          <button onClick={skip} className="btn-emerald" data-testid="skip-finalize-btn">
            Finalize report <ArrowRight size={14} className="inline ml-2"/>
          </button>
        </div>
      ) : (
        <>
          <div className="border border-border bg-card">
            <div className="grid grid-cols-12 py-3 px-4 bg-muted/40 border-b border-border label-caps text-xs">
              <div className="col-span-3">Order ID</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-2">Condition</div>
              <div className="col-span-2 text-right">Default cost</div>
              <div className="col-span-2 text-right">Override (₹/unit)</div>
            </div>
            <div className="max-h-[520px] overflow-auto">
              {returns.map((r, i) => (
                <div key={r.order_id + i} className={`grid grid-cols-12 py-3 px-4 items-center row-return ${i < returns.length - 1 ? "border-b border-border" : ""}`}>
                  <div className="col-span-3 num text-xs">{r.order_id}</div>
                  <div className="col-span-2 num text-sm">{r.sku}</div>
                  <div className="col-span-1 num text-sm text-right">{r.quantity}</div>
                  <div className="col-span-2">
                    <span className={`text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-0.5 border ${
                      (r.product_condition || "").toLowerCase().includes("sellable") ? "border-primary text-primary" : "border-destructive text-destructive"
                    }`}>
                      {r.product_condition || r.return_reason || "Return"}
                    </span>
                  </div>
                  <div className="col-span-2 num text-sm text-right text-muted-foreground">
                    {money(r.cost_price_unit)}
                  </div>
                  <div className="col-span-2">
                    <input type="number" step="0.01" value={r.override ?? ""}
                      onChange={e => setOverride(r.order_id, e.target.value)}
                      placeholder="Keep default"
                      className="cost-input text-right"
                      data-testid={`override-${r.order_id}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mt-8">
            <button onClick={() => nav(`/report/${id}/costs`)} className="btn-ghost" data-testid="back-costs">
              <ArrowLeft size={14} className="inline mr-2"/> Back
            </button>
            <button onClick={save} disabled={saving} className="btn-emerald" data-testid="finalize-btn">
              {saving ? "Finalizing…" : "Finalize report"} <ArrowRight size={14} className="inline ml-2"/>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
