import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { ArrowRight, ArrowLeft, Save, Search } from "lucide-react";
import { toast } from "sonner";

export default function CostPricesStep() {
  const { id } = useParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

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
      toast.success(`Saved ${costs.length} cost prices`);
      nav(`/report/${id}/returns`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-10 max-w-[1200px]">
      <div className="label-caps mb-2">Step 2 of 4</div>
      <h1 className="font-serif text-5xl tracking-tight mb-2">Cost prices</h1>
      <p className="text-muted-foreground mb-8">
        Enter <span className="text-foreground font-medium">unit</span> cost for each SKU. We'll remember these for next month.
        {missingCount > 0 && <span className="ml-2 text-destructive">{missingCount} SKU{missingCount>1?"s":""} still missing.</span>}
      </p>

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
