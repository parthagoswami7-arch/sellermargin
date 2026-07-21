import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { monthName, money } from "../lib/api";
import { Plus, FileText, Trash2, TrendingUp, Clock, Package } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, LineChart, Line } from "recharts";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const { user } = useAuth();
  const status = user?.status || {};

  const load = async () => {
    try {
      const r = await api.get("/reports");
      setReports(r.data.reports || []);
    } catch (e) {
      toast.error("Failed to load reports");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Delete this report?")) return;
    await api.delete(`/reports/${id}`);
    toast.success("Deleted");
    load();
  };

  const finalized = reports.filter(r => r.status === "finalized");
  const totalProfit = finalized.reduce((s, r) => s + (r.summary?.final_profit || 0), 0);
  const totalRevenue = finalized.reduce((s, r) => s + (r.summary?.total_received || 0), 0);

  // Month-over-month data, sorted by (year, month) ascending
  const momData = [...finalized]
    .filter(r => r.summary)
    .sort((a, b) => (a.target_year - b.target_year) || (a.target_month - b.target_month))
    .map(r => ({
      period: `${monthName(r.target_month)} ${String(r.target_year).slice(-2)}`,
      Received: r.summary.total_received,
      Deducted: r.summary.total_deduction,
      Profit: r.summary.final_profit,
      Ads: r.summary.ad_spend,
      "Profit %": r.summary.profit_pct,
    }));

  return (
    <div className="p-10 max-w-[1400px]">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="label-caps mb-2">Overview</div>
          <h1 className="font-serif text-5xl tracking-tight">Reports</h1>
        </div>
        <Link to="/new-report" className="btn-emerald" data-testid="new-report-btn">
          <Plus size={16} className="inline mr-2" /> New report
        </Link>
      </div>

      {/* Report-quota strip */}
      {!status.reports_unlimited && status.reports_quota !== undefined && (
        <div className="border border-border bg-card px-6 py-4 mb-8 flex flex-wrap items-center justify-between gap-4" data-testid="quota-strip">
          <div className="flex items-center gap-4">
            <Package size={18} className={status.reports_remaining === 0 ? "text-destructive" : "text-primary"}/>
            <div>
              <div className="text-sm">
                <span className="font-serif text-2xl tabular-nums">
                  <span className={status.reports_remaining === 0 ? "text-destructive" : ""}>{status.reports_remaining}</span>
                  <span className="text-muted-foreground text-base"> / {status.reports_quota}</span>
                </span>
                <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground ml-3">reports remaining</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Used {status.reports_used} of {status.reports_quota}. Regenerating an existing month is free.
              </div>
            </div>
          </div>
          {status.reports_remaining <= 2 && (
            <Link to="/upgrade" className="btn-outline text-xs" data-testid="quota-topup-link">
              {status.reports_remaining === 0 ? "Buy more reports" : "Top up soon"}
            </Link>
          )}
        </div>
      )}

      {finalized.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-border mb-10">
          <div className="p-6 border-r border-border">
            <div className="label-caps mb-2">Total reports</div>
            <div className="font-serif text-4xl">{reports.length}</div>
          </div>
          <div className="p-6 border-r border-border">
            <div className="label-caps mb-2">Total received (all months)</div>
            <div className="font-serif text-4xl num">{money(totalRevenue)}</div>
          </div>
          <div className="p-6">
            <div className="label-caps mb-2">Total final profit</div>
            <div className="font-serif text-4xl num text-primary">{money(totalProfit)}</div>
          </div>
        </div>
      )}

      {momData.length >= 2 && (
        <div className="border border-border bg-card mb-10" data-testid="mom-chart">
          <div className="p-4 border-b border-border flex items-baseline justify-between">
            <div className="label-caps">Month-over-month</div>
            <div className="text-xs text-muted-foreground">{momData.length} months</div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-6 lg:border-r border-border">
              <div className="label-caps mb-3 text-[10px]">Revenue vs Profit</div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={momData} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#D8DAD5" vertical={false}/>
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#5C5F5A" }} axisLine={{ stroke: "#D8DAD5" }} tickLine={false}/>
                    <YAxis tick={{ fontSize: 10, fill: "#5C5F5A" }} axisLine={{ stroke: "#D8DAD5" }} tickLine={false} tickFormatter={(v) => (v/1000).toFixed(0)+"k"}/>
                    <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "#fff", border: "1px solid #D8DAD5", borderRadius: 0, fontSize: 12 }}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                    <Bar dataKey="Received" fill="#5C7D77" />
                    <Bar dataKey="Profit" fill="#044535" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="p-6">
              <div className="label-caps mb-3 text-[10px]">Profit % trend</div>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={momData} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#D8DAD5" vertical={false}/>
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#5C5F5A" }} axisLine={{ stroke: "#D8DAD5" }} tickLine={false}/>
                    <YAxis tick={{ fontSize: 10, fill: "#5C5F5A" }} axisLine={{ stroke: "#D8DAD5" }} tickLine={false} tickFormatter={(v) => v.toFixed(0)+"%"}/>
                    <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} contentStyle={{ background: "#fff", border: "1px solid #D8DAD5", borderRadius: 0, fontSize: 12 }}/>
                    <Line type="monotone" dataKey="Profit %" stroke="#F4B223" strokeWidth={2} dot={{ fill: "#F4B223", r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="border border-border p-16 text-center">
          <FileText size={40} strokeWidth={1.5} className="mx-auto mb-6 text-muted-foreground" />
          <h3 className="font-serif text-3xl mb-3">No reports yet</h3>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Start by creating your first monthly reconciliation. Upload five Amazon reports and get instant P&amp;L.
          </p>
          <button onClick={() => nav("/new-report")} className="btn-emerald" data-testid="empty-new-btn">
            <Plus size={16} className="inline mr-2" /> Create first report
          </button>
        </div>
      ) : (
        <div className="border border-border">
          <div className="grid grid-cols-12 py-3 px-6 bg-muted/40 border-b border-border label-caps">
            <div className="col-span-4">Report</div>
            <div className="col-span-2">Month</div>
            <div className="col-span-2 text-right">Final Profit</div>
            <div className="col-span-2 text-right">Profit %</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1"></div>
          </div>
          {reports.map((r) => (
            <div key={r.report_id} className="grid grid-cols-12 py-4 px-6 border-b border-border last:border-b-0 items-center hover:bg-muted/20 transition-colors">
              <div className="col-span-4">
                <Link to={`/report/${r.report_id}`} className="font-medium hover:underline" data-testid={`report-link-${r.report_id}`}>{r.name}</Link>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Clock size={10}/> {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
              <div className="col-span-2 num text-sm">{monthName(r.target_month)} {r.target_year}</div>
              <div className="col-span-2 num text-right text-primary font-medium">
                {r.summary ? money(r.summary.final_profit) : "—"}
              </div>
              <div className="col-span-2 num text-right">
                {r.summary ? `${r.summary.profit_pct.toFixed(2)}%` : "—"}
              </div>
              <div className="col-span-1">
                <span className={`text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-0.5 border ${
                  r.status === "finalized" ? "border-primary text-primary" : "border-muted-foreground text-muted-foreground"
                }`}>{r.status}</span>
              </div>
              <div className="col-span-1 text-right">
                <button onClick={() => del(r.report_id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-${r.report_id}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
