import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { money } from "../lib/api";
import { ArrowRight, ArrowLeft, Info, PackageCheck, PackageX, Sparkles, Wand2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const isSellable = (r) => (r.product_condition || "").toLowerCase().includes("sellable");
const isDamagedFba = (r) => r.return_source === "fba" && !isSellable(r);
const isEasyShip = (r) => r.return_source === "easyship";

export default function ReturnsStep() {
  const { id } = useParams();
  const nav = useNavigate();
  const [returns, setReturns] = useState([]);
  const [saving, setSaving] = useState(false);
  const [bulkFee, setBulkFee] = useState("");

  useEffect(() => {
    (async () => {
      const r = await api.get(`/reports/${id}/returns`);
      setReturns((r.data.returns || []).map(x => ({
        ...x,
        override: x.cost_price_unit_override === null || x.cost_price_unit_override === undefined ? "" : String(x.cost_price_unit_override),
      })));
    })();
  }, [id]);

  const setOverride = (order_id, v) =>
    setReturns(prev => prev.map(r => r.order_id === order_id ? { ...r, override: v } : r));

  const sellable  = useMemo(() => returns.filter(isSellable), [returns]);
  const damaged   = useMemo(() => returns.filter(isDamagedFba), [returns]);
  const easyship  = useMemo(() => returns.filter(isEasyShip), [returns]);

  // Live impact numbers
  const impact = useMemo(() => {
    const eff = (r) => {
      if (r.override !== "" && r.override !== null && r.override !== undefined) {
        const n = Number(r.override);
        return Number.isNaN(n) ? Number(r.cost_price_unit || 0) : n;
      }
      return Number(r.cost_price_unit || 0);
    };
    let defaultCogs = 0, adjustedCogs = 0, units = 0;
    for (const r of returns) {
      const q = Number(r.quantity || 0);
      units += q;
      defaultCogs  += q * Number(r.cost_price_unit || 0);
      adjustedCogs += q * eff(r);
    }
    return {
      units,
      defaultCogs,
      adjustedCogs,
      savings: defaultCogs - adjustedCogs,
    };
  }, [returns]);

  const applyBulkSellable = () => {
    const fee = Number(bulkFee);
    if (bulkFee === "" || Number.isNaN(fee) || fee < 0) return toast.error("Enter a repackaging fee (₹)");
    setReturns(prev => prev.map(r => isSellable(r) ? { ...r, override: String(fee) } : r));
    toast.success(`Applied ₹${fee.toFixed(2)} to ${sellable.length} sellable return${sellable.length === 1 ? "" : "s"}`);
  };

  const clearAllOverrides = () => {
    setReturns(prev => prev.map(r => ({ ...r, override: "" })));
    toast.success("All overrides cleared");
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = returns.map(r => ({
        order_id: r.order_id,
        cost_price_unit_override: r.override === "" ? null : Number(r.override),
      }));
      await api.post(`/reports/${id}/return-overrides`, items);
      await api.post(`/reports/${id}/finalize`);
      toast.success("Report generated");
      nav(`/report/${id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to generate report");
    } finally { setSaving(false); }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await api.post(`/reports/${id}/finalize`);
      nav(`/report/${id}`);
    } finally { setSaving(false); }
  };

  const Row = ({ r, i, last, showKind = false }) => {
    const eff = r.override !== "" ? Number(r.override) : Number(r.cost_price_unit || 0);
    const rowSaving = (Number(r.quantity || 0)) * (Number(r.cost_price_unit || 0) - eff);
    return (
      <div className={`grid grid-cols-12 py-3 px-4 items-center row-return ${!last ? "border-b border-border" : ""}`}>
        <div className="col-span-3 num text-xs">{r.order_id}</div>
        <div className="col-span-2 num text-sm">{r.sku}</div>
        <div className="col-span-1 num text-sm text-right">{r.quantity}</div>
        <div className="col-span-2 num text-sm text-right text-muted-foreground">{money(r.cost_price_unit)}</div>
        <div className="col-span-2">
          <input type="number" step="0.01" value={r.override}
            onChange={e => setOverride(r.order_id, e.target.value)}
            placeholder={isSellable(r) ? "Repack fee ₹" : (isEasyShip(r) ? "Inspect & set" : "Keep full cost")}
            className="cost-input text-right"
            data-testid={`override-${r.order_id}`} />
        </div>
        <div className={`col-span-2 num text-sm text-right ${rowSaving > 0 ? "text-primary font-medium" : (rowSaving < 0 ? "text-destructive" : "text-muted-foreground")}`}>
          {rowSaving > 0 ? `− ${money(rowSaving)}` : (rowSaving < 0 ? `+ ${money(-rowSaving)}` : "—")}
          {showKind && r.return_kind && <div className="text-[9px] uppercase tracking-[0.15em] font-bold text-muted-foreground mt-0.5">{r.return_kind === "rto" ? "RTO" : "Customer"} · {r.return_reason}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="p-10 max-w-[1300px]">
      <div className="label-caps mb-2">Step 3 of 4 · Final review</div>
      <h1 className="font-serif text-5xl tracking-tight mb-2">Review returns</h1>
      <p className="text-muted-foreground mb-8 max-w-3xl">
        Every returned order is highlighted in orange. There are three groups:
        <span className="mx-1 font-medium text-primary">SELLABLE</span> (FBA-confirmed resellable — replace unit cost with your repackaging/refurb fee),
        <span className="mx-1 font-medium text-destructive">DAMAGED / UNSELLABLE</span> (FBA-confirmed unsellable — keep full unit cost),
        and <span className="mx-1 font-medium text-accent">EASY SHIP — INSPECT</span> (both customer returns and RTO — Amazon doesn't tell us the condition, so inspect the physical package and either keep the full cost, enter a repackaging fee, or bump the cost up if it was lost/destroyed in transit).
      </p>

      {returns.length === 0 ? (
        <div className="border border-border p-16 text-center bg-card">
          <Info size={32} strokeWidth={1.5} className="mx-auto mb-4 text-primary"/>
          <div className="font-serif text-2xl mb-2">No returns this month</div>
          <p className="text-muted-foreground mb-8">Nothing to review — you're all set.</p>
          <button onClick={skip} className="btn-emerald" data-testid="skip-finalize-btn">
            Generate report <ArrowRight size={14} className="inline ml-2"/>
          </button>
        </div>
      ) : (
        <>
          {/* Impact + bulk action */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 border border-border mb-8">
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-border">
              <div className="label-caps mb-2">Returned units</div>
              <div className="font-serif text-3xl num">{impact.units}</div>
              <div className="text-xs text-muted-foreground mt-1">{sellable.length} sellable · {damaged.length} damaged · {easyship.length} easy ship</div>
            </div>
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-border">
              <div className="label-caps mb-2">Default COGS on returns</div>
              <div className="font-serif text-3xl num">{money(impact.defaultCogs)}</div>
            </div>
            <div className="p-6 border-b lg:border-b-0 lg:border-r border-border">
              <div className="label-caps mb-2">Adjusted COGS</div>
              <div className={`font-serif text-3xl num ${impact.savings > 0 ? "text-primary" : ""}`}>{money(impact.adjustedCogs)}</div>
              {impact.savings > 0 && <div className="text-xs text-primary mt-1">Savings: {money(impact.savings)}</div>}
            </div>
            <div className="p-6 bg-accent/5">
              <div className="label-caps mb-2 flex items-center gap-2"><Wand2 size={12}/> Bulk sellable</div>
              <div className="flex items-center gap-2">
                <input type="number" step="0.01" value={bulkFee} onChange={e => setBulkFee(e.target.value)}
                  placeholder="Repack ₹" className="cost-input text-right flex-1" data-testid="bulk-fee-input"/>
                <button onClick={applyBulkSellable} disabled={sellable.length === 0}
                  className="btn-emerald text-[11px] px-3 py-2" data-testid="bulk-apply-btn">Apply to all</button>
              </div>
              <button onClick={clearAllOverrides} className="mt-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="clear-overrides-btn">
                <RotateCcw size={10}/> Clear all overrides
              </button>
            </div>
          </div>

          {/* SELLABLE section */}
          {sellable.length > 0 && (
            <div className="border border-border bg-card mb-6" data-testid="sellable-section">
              <div className="p-4 border-b border-border flex items-center gap-3">
                <PackageCheck size={16} className="text-primary"/>
                <div>
                  <div className="text-sm font-medium">Sellable returns ({sellable.length})</div>
                  <div className="text-xs text-muted-foreground">These items can be re-listed. Replace cost with your repackaging fee.</div>
                </div>
              </div>
              <div className="grid grid-cols-12 py-2 px-4 bg-muted/30 border-b border-border label-caps text-[10px]">
                <div className="col-span-3">Order</div>
                <div className="col-span-2">SKU</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Default cost</div>
                <div className="col-span-2 text-right">Override (₹/unit)</div>
                <div className="col-span-2 text-right">Savings</div>
              </div>
              <div className="max-h-[300px] overflow-auto">
                {sellable.map((r, i) => <Row key={r.order_id + i} r={r} i={i} last={i === sellable.length - 1}/>)}
              </div>
            </div>
          )}

          {/* DAMAGED section */}
          {damaged.length > 0 && (
            <div className="border border-border bg-card mb-6" data-testid="damaged-section">
              <div className="p-4 border-b border-border flex items-center gap-3">
                <PackageX size={16} className="text-destructive"/>
                <div>
                  <div className="text-sm font-medium">Damaged / unsellable returns ({damaged.length})</div>
                  <div className="text-xs text-muted-foreground">Full unit cost applies. Only override if you can salvage part of the value.</div>
                </div>
              </div>
              <div className="grid grid-cols-12 py-2 px-4 bg-muted/30 border-b border-border label-caps text-[10px]">
                <div className="col-span-3">Order</div>
                <div className="col-span-2">SKU</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Default cost</div>
                <div className="col-span-2 text-right">Override (₹/unit)</div>
                <div className="col-span-2 text-right">Savings</div>
              </div>
              <div className="max-h-[300px] overflow-auto">
                {damaged.map((r, i) => <Row key={r.order_id + i} r={r} i={i} last={i === damaged.length - 1}/>)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8">
            <button onClick={() => nav(`/report/${id}/costs`)} className="btn-ghost" data-testid="back-costs">
              <ArrowLeft size={14} className="inline mr-2"/> Back
            </button>
            <div className="flex items-center gap-4">
              {impact.savings > 0 && (
                <div className="text-xs text-primary flex items-center gap-2">
                  <Sparkles size={12}/> Overrides save <span className="font-mono font-bold">{money(impact.savings)}</span> on COGS
                </div>
              )}
              <button onClick={save} disabled={saving} className="btn-emerald" data-testid="finalize-btn">
                {saving ? "Generating…" : "Generate report"} <ArrowRight size={14} className="inline ml-2"/>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
          <div className="col-span-3">Order</div>
                <div className="col-span-2">SKU</div>
                <div className="col-span-1 text-right">Qty</div>
                <div className="col-span-2 text-right">Default cost</div>
                <div className="col-span-2 text-right">Override (₹/unit)</div>
                <div className="col-span-2 text-right">Type · Savings</div>
              </div>
              <div className="max-h-[300px] overflow-auto">
                {easyship.map((r, i) => <Row key={r.order_id + i} r={r} i={i} last={i === easyship.length - 1} showKind />)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8">
            <button onClick={() => nav(`/report/${id}/costs`)} className="btn-ghost" data-testid="back-costs">
              <ArrowLeft size={14} className="inline mr-2"/> Back
            </button>
            <div className="flex items-center gap-4">
              {impact.savings > 0 && (
                <div className="text-xs text-primary flex items-center gap-2">
                  <Sparkles size={12}/> Overrides save <span className="font-mono font-bold">{money(impact.savings)}</span> on COGS
                </div>
              )}
              <button onClick={save} disabled={saving} className="btn-emerald" data-testid="finalize-btn">
                {saving ? "Generating…" : "Generate report"} <ArrowRight size={14} className="inline ml-2"/>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
