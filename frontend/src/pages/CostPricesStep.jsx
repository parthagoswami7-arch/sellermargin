import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { ArrowRight, ArrowLeft, Save, Search, Package, Truck, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function CostPricesStep() {
  const { id } = useParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState({ easyship_orders_count: 0, inbound_shipments_count: 0 });
  // Misc cost intentionally resets per-report (per-month): we DO NOT prefill it
  // from any prior state, and the backend stores it on the report doc only.
  const [extras, setExtras] = useState({
    packing_cost_per_easyship: "",
    total_inbound_packing_cost: "",
    misc_cost: "",
  });

  useEffect(() => {
    (async () => {
      // rebuild to get latest skus needing cost
      const r = await api.post(`/reports/${id}/build`);
      const skus = r.data.skus || [];
      setRows(skus.map(s => ({ ...s, cost_price: s.has_cost ? "" : "" })));
      // fetch already known costs and prefill
      const cp = await api.get("/cost-prices");
      const map = new Map((cp.data.cost_prices || []).map(c => [c.sku, c.cost_price]));
      setRows(skus.map(s => ({ ...s, cost_price: map.get(s.sku) ?? "" })));
      // fetch monthly counts + any saved extras on this report
      try {
        const c = await api.get(`/reports/${id}/counts`);
        setCounts({
          easyship_orders_count:   c.data.easyship_orders_count || 0,
          inbound_shipments_count: c.data.inbound_shipments_count || 0,
        });
        const savedExtras = c.data.extras || {};
        // Prefill packing costs from previous save on THIS report (survives refresh),
        // but leave misc_cost blank — must be re-entered each session even for the same report.
        setExtras({
          packing_cost_per_easyship:  savedExtras.packing_cost_per_easyship ?? "",
          total_inbound_packing_cost: savedExtras.total_inbound_packing_cost ?? "",
          misc_cost: "",
        });
      } catch (_) { /* counts endpoint is nice-to-have; SKU flow still works */ }
    })();
  }, [id]);

  const filtered = rows.filter(r => !q || r.sku.toLowerCase().includes(q.toLowerCase()) || (r.product_name || "").toLowerCase().includes(q.toLowerCase()));
  const missingCount = rows.filter(r => !r.cost_price && r.cost_price !== 0).length;

  const save = async () => {
    setSaving(true);
    try {
      const costs = rows
        .filter(r => r.cost_price !== "" && r.cost_price !== null && r.cost_price !== undefined)
        .map(r => ({ sku: r.sku, cost_price: Number(r.cost_price), product_name: r.product_name || "" }));
      await api.post(`/reports/${id}/costs`, { costs });
      // Persist extras. Empty strings → 0 (means "not applicable this month").
      await api.post(`/reports/${id}/extras`, {
        packing_cost_per_easyship:  Number(extras.packing_cost_per_easyship || 0),
        total_inbound_packing_cost: Number(extras.total_inbound_packing_cost || 0),
        misc_cost:                  Number(extras.misc_cost || 0),
      });
      toast.success(`Saved ${costs.length} cost prices + monthly extras`);
      nav(`/report/${id}/returns`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const easyshipTotal = (Number(extras.packing_cost_per_easyship) || 0) * (counts.easyship_orders_count || 0);

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-[1200px]">
      <div className="label-caps mb-2">Step 2 of 4</div>
      <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl tracking-tight mb-2">Cost prices &amp; monthly extras</h1>
      <p className="text-sm sm:text-base text-muted-foreground mb-8">
        Enter <span className="text-foreground font-medium">unit</span> cost for each SKU and any fixed costs for this month.
        {missingCount > 0 && <span className="ml-2 text-destructive">{missingCount} SKU{missingCount>1?"s":""} still missing.</span>}
      </p>

      {/* Fixed monthly extras — packing + misc. Applied to Total Deduction. */}
      <div className="border border-border bg-card mb-8" data-testid="monthly-extras-section">
        <div className="px-6 py-4 border-b border-border">
          <div className="label-caps text-primary">Monthly extras · {(counts.easyship_orders_count + counts.inbound_shipments_count) === 0 ? "based on this month's reports" : "counts derived from the uploaded reports"}</div>
          <div className="text-sm text-muted-foreground mt-1">These add to Total Deduction. Miscellaneous cost resets each month — you must re-enter it every time.</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-t border-border">
          {/* Easy Ship packing */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-primary"/>
              <label className="label-caps" htmlFor="ext-easyship">Packing per Easy Ship order (₹)</label>
            </div>
            <input
              id="ext-easyship" type="number" step="0.01" min="0" placeholder="0.00"
              value={extras.packing_cost_per_easyship}
              onChange={e => setExtras(x => ({ ...x, packing_cost_per_easyship: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="extras-easyship-input"
            />
            <div className="text-xs text-muted-foreground mt-2" data-testid="extras-easyship-count">
              Easy Ship orders this month: <b className="font-mono text-foreground">{counts.easyship_orders_count}</b>
            </div>
            {easyshipTotal > 0 && (
              <div className="text-[11px] uppercase tracking-[0.15em] font-bold text-primary mt-1" data-testid="extras-easyship-preview">
                → adds ₹{easyshipTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {/* Inbound shipments total */}
          <div className="p-5 border-b md:border-b-0 md:border-r border-border">
            <div className="flex items-center gap-2 mb-2">
              <Truck size={14} className="text-primary"/>
              <label className="label-caps" htmlFor="ext-inbound">Total inbound packing cost (₹)</label>
            </div>
            <input
              id="ext-inbound" type="number" step="0.01" min="0" placeholder="0.00"
              value={extras.total_inbound_packing_cost}
              onChange={e => setExtras(x => ({ ...x, total_inbound_packing_cost: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="extras-inbound-input"
            />
            <div className="text-xs text-muted-foreground mt-2" data-testid="extras-inbound-count">
              Inbound shipments this month: <b className="font-mono text-foreground">{counts.inbound_shipments_count}</b>
              <span className="ml-1 text-muted-foreground">(reference only)</span>
            </div>
          </div>

          {/* Miscellaneous cost */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-primary"/>
              <label className="label-caps" htmlFor="ext-misc">Miscellaneous cost (₹)</label>
            </div>
            <input
              id="ext-misc" type="number" step="0.01" min="0" placeholder="0.00"
              value={extras.misc_cost}
              onChange={e => setExtras(x => ({ ...x, misc_cost: e.target.value }))}
              className="w-full border border-border bg-background px-3 py-2 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="extras-misc-input"
            />
            <div className="text-xs text-muted-foreground mt-2">
              Resets each month · does not carry over from previous reports.
            </div>
          </div>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search SKU or product name"
              className="w-full pl-9 pr-3 py-2 border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" data-testid="cost-search" />
          </div>
          <div className="label-caps ml-auto">{filtered.length} skus</div>
        </div>
        <div className="grid grid-cols-12 py-3 px-4 bg-muted/40 border-b border-border label-caps">
          <div className="col-span-4">SKU</div>
          <div className="col-span-5">Product</div>
          <div className="col-span-1 text-right">Units</div>
          <div className="col-span-2 text-right">Unit Cost (₹)</div>
        </div>
        <div className="max-h-[540px] overflow-auto">
          {filtered.map((r, i) => (
            <div key={r.sku} className={`grid grid-cols-12 py-2 px-4 items-center ${i < filtered.length - 1 ? "border-b border-border" : ""}`}>
              <div className="col-span-4 num text-sm">{r.sku}</div>
              <div className="col-span-5 text-sm truncate text-muted-foreground">{r.product_name || "—"}</div>
              <div className="col-span-1 text-right num text-sm">{r.count}</div>
              <div className="col-span-2">
                <input
                  type="number"
                  step="0.01"
                  value={r.cost_price === null || r.cost_price === undefined ? "" : r.cost_price}
                  onChange={e => setRows(prev => prev.map(x => x.sku === r.sku ? { ...x, cost_price: e.target.value } : x))}
                  className="cost-input text-right"
                  data-testid={`cost-input-${r.sku}`}
                  placeholder="0.00"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-8">
        <button onClick={() => nav(`/new-report`)} className="btn-ghost" data-testid="back-btn">
          <ArrowLeft size={14} className="inline mr-2"/> Back
        </button>
        <button onClick={save} disabled={saving} className="btn-emerald" data-testid="save-costs-btn">
          <Save size={14} className="inline mr-2" /> {saving ? "Saving…" : "Save & continue"} <ArrowRight size={14} className="inline ml-2"/>
        </button>
      </div>
    </div>
  );
}
