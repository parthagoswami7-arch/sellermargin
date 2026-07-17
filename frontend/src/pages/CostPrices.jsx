import React, { useEffect, useState } from "react";
import api, { money } from "../lib/api";
import { Search, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

export default function CostPrices() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [newRow, setNewRow] = useState({ sku: "", cost_price: "", product_name: "" });

  const load = async () => {
    const r = await api.get("/cost-prices");
    setRows(r.data.cost_prices || []);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => !q || r.sku.toLowerCase().includes(q.toLowerCase()) || (r.product_name||"").toLowerCase().includes(q.toLowerCase()));

  const saveRow = async (row) => {
    await api.post("/cost-prices", { sku: row.sku, cost_price: Number(row.cost_price), product_name: row.product_name || "" });
    toast.success("Saved");
    load();
  };

  const addRow = async () => {
    if (!newRow.sku || newRow.cost_price === "") return toast.error("SKU and cost required");
    await api.post("/cost-prices", { sku: newRow.sku, cost_price: Number(newRow.cost_price), product_name: newRow.product_name });
    setNewRow({ sku: "", cost_price: "", product_name: "" });
    toast.success("Added");
    load();
  };

  return (
    <div className="p-10 max-w-[1200px]">
      <div className="label-caps mb-2">Library</div>
      <h1 className="font-serif text-5xl tracking-tight mb-2">Cost prices</h1>
      <p className="text-muted-foreground mb-8">Your SKU cost library. These are used every month automatically.</p>

      <div className="border border-border bg-card mb-8 p-6">
        <div className="label-caps mb-4">Add / update SKU</div>
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-3">
            <label className="label-caps block mb-1">SKU</label>
            <input value={newRow.sku} onChange={e => setNewRow({...newRow, sku: e.target.value})}
              className="w-full border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" data-testid="new-sku"/>
          </div>
          <div className="col-span-5">
            <label className="label-caps block mb-1">Product name</label>
            <input value={newRow.product_name} onChange={e => setNewRow({...newRow, product_name: e.target.value})}
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" data-testid="new-name"/>
          </div>
          <div className="col-span-2">
            <label className="label-caps block mb-1">Unit cost (₹)</label>
            <input type="number" step="0.01" value={newRow.cost_price} onChange={e => setNewRow({...newRow, cost_price: e.target.value})}
              className="cost-input text-right" data-testid="new-cost"/>
          </div>
          <div className="col-span-2">
            <button onClick={addRow} className="btn-emerald w-full" data-testid="add-cost-btn">Add / update</button>
          </div>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search"
              className="w-full pl-9 pr-3 py-2 border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" data-testid="cost-lib-search"/>
          </div>
          <div className="label-caps ml-auto">{filtered.length} of {rows.length}</div>
        </div>
        <div className="grid grid-cols-12 py-2 px-4 bg-muted/40 border-b border-border label-caps text-[10px]">
          <div className="col-span-3">SKU</div>
          <div className="col-span-6">Product</div>
          <div className="col-span-3 text-right">Unit cost (₹)</div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          {filtered.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No SKUs yet. Add your first one above.</div>}
          {filtered.map((r, i) => (
            <div key={r.sku} className={`grid grid-cols-12 py-2 px-4 items-center ${i < filtered.length -1 ? "border-b border-border" : ""}`}>
              <div className="col-span-3 num text-sm">{r.sku}</div>
              <div className="col-span-6 text-sm text-muted-foreground truncate">{r.product_name || "—"}</div>
              <div className="col-span-3 flex items-center gap-2">
                <input type="number" step="0.01" defaultValue={r.cost_price}
                  onBlur={e => saveRow({ ...r, cost_price: e.target.value })}
                  className="cost-input text-right"
                  data-testid={`lib-cost-${r.sku}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
