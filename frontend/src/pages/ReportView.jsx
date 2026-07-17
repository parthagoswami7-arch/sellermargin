import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { money, monthName, API_BASE } from "../lib/api";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { FileDown, Download, ArrowLeft, TrendingUp, Percent } from "lucide-react";

const PALETTE = ["#044535", "#F4B223", "#5C7D77", "#B34335", "#8A8F7A"];

export default function ReportView() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      const r = await api.get(`/reports/${id}`);
      setReport(r.data);
      const rr = await api.get(`/reports/${id}/rows`);
      setRows(rr.data.rows || []);
    })();
  }, [id]);

  if (!report) return <div className="p-10 text-muted-foreground text-sm">Loading…</div>;

  const s = report.summary;
  if (!s) {
    return (
      <div className="p-10">
        <h1 className="font-serif text-4xl mb-4">Not finalized</h1>
        <Link to={`/report/${id}/costs`} className="btn-emerald">Continue setup</Link>
      </div>
    );
  }

  const expenseData = [
    { name: "COGS", value: s.cogs },
    { name: "Inbound fee", value: Math.abs(s.inbound_fee) },
    { name: "Storage fee", value: Math.abs(s.storage_fee) },
    { name: "Removal fee", value: s.removal_fee },
    { name: "Ad spend", value: s.ad_spend },
  ].filter(d => d.value > 0);

  const cmpData = [
    { name: "Received", val: s.total_received },
    { name: "Deducted", val: s.total_deduction },
    { name: "Profit",   val: s.final_profit },
  ];

  const download = (kind) => {
    const url = `${API_BASE}/reports/${id}/export.${kind}`;
    window.open(url, "_blank");
  };

  return (
    <div className="p-10 max-w-[1400px]">
      <div className="flex items-end justify-between mb-2">
        <div>
          <Link to="/dashboard" className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground flex items-center gap-2"><ArrowLeft size={12}/> All reports</Link>
          <h1 className="font-serif text-5xl tracking-tight mt-4">{report.name}</h1>
          <div className="label-caps mt-2">{monthName(report.target_month)} {report.target_year} · {s.orders_count} orders · {s.returns_count} returns</div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => download("pdf")} className="btn-outline" data-testid="export-pdf">
            <FileDown size={14} className="inline mr-2"/> PDF
          </button>
          <button onClick={() => download("xlsx")} className="btn-emerald" data-testid="export-xlsx">
            <Download size={14} className="inline mr-2"/> Excel
          </button>
        </div>
      </div>

      {/* Big profit banner */}
      <div className="mt-8 border border-border bg-card p-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="label-caps mb-3">Final profit</div>
          <div className="font-serif text-6xl text-primary num">{money(s.final_profit)}</div>
          <div className="text-sm text-muted-foreground mt-2">
            {s.profit_pct.toFixed(2)}% of revenue · {s.profit_pct_on_cogs.toFixed(2)}% on cost
          </div>
        </div>
        <div>
          <div className="label-caps mb-2">Total received</div>
          <div className="font-serif text-3xl num">{money(s.total_received)}</div>
        </div>
        <div>
          <div className="label-caps mb-2">Total deduction</div>
          <div className="font-serif text-3xl num">{money(s.total_deduction)}</div>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-0 border border-border mt-8">
        {[
          ["Settlement", money(s.settlement)],
          ["Reimbursement", money(s.reimbursement)],
          ["COGS", money(s.cogs)],
          ["Ad spend", money(s.ad_spend)],
          ["Removal fee", money(s.removal_fee)],
        ].map(([k,v], i) => (
          <div key={k} className={`p-6 ${i < 4 ? "md:border-r border-border" : ""} border-b md:border-b-0 border-border`}>
            <div className="label-caps mb-2">{k}</div>
            <div className="font-mono text-xl">{v}</div>
          </div>
        ))}
        {[
          ["Inbound fee", money(s.inbound_fee)],
          ["Storage fee", money(s.storage_fee)],
          ["ACOS %", `${s.acos_pct.toFixed(2)}%`],
          ["Return %", `${s.return_pct.toFixed(2)}%`],
          ["Item price total", money(s.total_item_price)],
        ].map(([k,v], i) => (
          <div key={k} className={`p-6 ${i < 4 ? "md:border-r border-border" : ""} border-t border-border`}>
            <div className="label-caps mb-2">{k}</div>
            <div className="font-mono text-xl">{v}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="border border-border bg-card p-6">
          <div className="label-caps mb-4">Expense breakdown</div>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={expenseData} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={100} strokeWidth={0}>
                  {expenseData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "#fff", border: "1px solid #D8DAD5", borderRadius: 0 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {expenseData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="flex-1 text-muted-foreground">{d.name}</span>
                <span className="num font-mono">{money(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-border bg-card p-6">
          <div className="label-caps mb-4">Money flow</div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={cmpData}>
                <CartesianGrid stroke="#D8DAD5" strokeDasharray="0" vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#5C5F5A" }} axisLine={{ stroke: "#D8DAD5" }} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: "#5C5F5A" }} axisLine={{ stroke: "#D8DAD5" }} tickLine={false} tickFormatter={(v) => (v/1000).toFixed(0) + "k"}/>
                <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "#fff", border: "1px solid #D8DAD5", borderRadius: 0 }}/>
                <Bar dataKey="val" fill="#044535" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rows table */}
      <div className="border border-border bg-card mt-8">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="label-caps">Per-order breakdown</div>
          <div className="text-xs text-muted-foreground">Orange rows are returns</div>
        </div>
        <div className="grid grid-cols-12 py-2 px-4 bg-muted/40 border-b border-border label-caps text-[10px]">
          <div className="col-span-3">Order</div>
          <div className="col-span-2">SKU</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2 text-right">Item Price</div>
          <div className="col-span-2 text-right">Payment</div>
          <div className="col-span-2 text-right">Cost</div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          {rows.map((r, i) => {
            const eff = r.cost_price_unit_override ?? r.cost_price_unit ?? 0;
            const total = (r.quantity || 0) * (eff || 0);
            return (
              <div key={i} className={`grid grid-cols-12 py-2 px-4 items-center text-xs ${r.is_return ? "row-return" : ""} ${i < rows.length - 1 ? "border-b border-border" : ""}`}>
                <div className="col-span-3 num">{r.order_id}</div>
                <div className="col-span-2 num">{r.sku}</div>
                <div className="col-span-1 text-right num">{r.quantity}</div>
                <div className="col-span-2 text-right num">{money(r.item_price)}</div>
                <div className="col-span-2 text-right num">{money(r.payment)}</div>
                <div className="col-span-2 text-right num">{money(total)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
