import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { Users, IndianRupee, FileText, Sparkles, Ticket, Copy, Check, Building2, Save, FileDown, FileSpreadsheet, Calendar, Receipt, Download, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [codes, setCodes] = useState([]);
  const [plan, setPlan] = useState("trial_10");
  const [count, setCount] = useState(10);
  const [plans, setPlans] = useState({});
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [seller, setSeller] = useState(null);
  const [savingSeller, setSavingSeller] = useState(false);
  const [states, setStates] = useState([]);
  const [orders, setOrders] = useState([]);
  const [salesSummary, setSalesSummary] = useState(null);

  // Sales/GSTR date pickers — default to current month
  const now = new Date();
  const [fromDate, setFromDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => now.toISOString().slice(0, 10));
  const [gstrMonth, setGstrMonth] = useState(now.getMonth() + 1);
  const [gstrYear, setGstrYear] = useState(now.getFullYear());

  const loadAll = async () => {
    const [s, u, c, p, sl, st, o, sm] = await Promise.all([
      api.get("/admin/stats"),
      api.get("/admin/users"),
      api.get("/admin/codes"),
      api.get("/plans"),
      api.get("/admin/settings/seller"),
      api.get("/settings/india-states"),
      api.get("/admin/orders"),
      api.get("/admin/exports/summary"),
    ]);
    setStats(s.data);
    setUsers(u.data.users || []);
    setCodes(c.data.codes || []);
    setPlans(p.data.plans || {});
    setSeller(sl.data.seller || null);
    setStates(st.data.states || []);
    setOrders(o.data.orders || []);
    setSalesSummary(sm.data);
  };

  useEffect(() => { loadAll(); }, []);

  const saveSeller = async () => {
    if (!seller) return;
    setSavingSeller(true);
    try {
      const r = await api.put("/admin/settings/seller", seller);
      setSeller(r.data.seller || seller);
      toast.success("Business settings saved. New invoices will use this info.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSavingSeller(false); }
  };

  const downloadFile = async (url, filename) => {
    try {
      const r = await api.get(url, { responseType: "blob" });
      const blob = new Blob([r.data]);
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Downloading ${filename}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Download failed");
    }
  };

  const downloadSalesCsv = () => {
    const tag = `${fromDate}_to_${toDate}`;
    downloadFile(`/admin/exports/sales.csv?from_date=${fromDate}&to_date=${toDate}`, `sales_${tag}.csv`);
  };

  const downloadGstr1 = () => {
    downloadFile(`/admin/exports/gstr1.xlsx?month=${gstrMonth}&year=${gstrYear}`, `GSTR1_${String(gstrMonth).padStart(2,"0")}${gstrYear}.xlsx`);
  };

  const downloadInvoice = (order) => {
    if (!order.invoice_no) { toast.error("No invoice generated yet"); return; }
    downloadFile(`/invoices/${order.order_id}.pdf`, `${order.invoice_no.replace(/\//g,"-")}.pdf`);
  };

  const resendEmail = async (order) => {
    if (!order.code_delivered) { toast.error("Order not fulfilled yet"); return; }
    if (!window.confirm(`Resend activation email + tax invoice to ${order.user_email}?`)) return;
    try {
      const r = await api.post(`/admin/orders/${order.order_id}/resend-email`);
      toast.success(`Email resent to ${r.data.sent_to}`);
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Resend failed");
    }
  };

  const deleteOrder = async (order) => {
    const buyer = order.buyer_name || order.user_email;
    const amount = `₹${Number(order.amount || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    const isPaid = order.code_delivered;
    const msg = isPaid
      ? `Delete PAID order ${order.invoice_no || order.order_id} (${buyer}, ${amount})?\n\n` +
        `This will also:\n• Reverse the reports quota granted (${order.plan})\n• Delete the linked activation code\n\n` +
        `Note: paid_until on the user is NOT rewound. This action cannot be undone.`
      : `Delete pending order ${order.order_id} (${buyer}, ${amount})?\n\nThis action cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      const r = await api.delete(`/admin/orders/${order.order_id}`);
      toast.success(
        r.data.quota_reversed > 0
          ? `Order deleted · ${r.data.quota_reversed} reports reversed from user's quota`
          : "Order deleted"
      );
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/codes/generate", { plan, count: Number(count) });
      toast.success(`Generated ${r.data.codes.length} code${r.data.codes.length === 1 ? "" : "s"}`);
      await loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to generate");
    } finally { setBusy(false); }
  };

  const copyCode = (c) => {
    navigator.clipboard.writeText(c);
    setCopied(c);
    setTimeout(() => setCopied(""), 1500);
  };

  const copyAllActive = () => {
    const active = codes.filter(c => c.status === "active").map(c => c.code).join("\n");
    if (!active) return toast.error("No active codes to copy");
    navigator.clipboard.writeText(active);
    toast.success(`Copied ${active.split("\n").length} active codes`);
  };

  const activeCount = codes.filter(c => c.status === "active").length;
  const usedCount = codes.filter(c => c.status === "used").length;

  return (
    <div className="p-10 max-w-[1400px]">
      <div className="label-caps mb-2">Admin</div>
      <h1 className="font-serif text-5xl tracking-tight mb-8">Owner console</h1>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border border-border mb-10">
          <Stat label="Total users" value={stats.total_users} icon={Users}/>
          <Stat label="Active paying" value={stats.paid_users} icon={Sparkles}/>
          <Stat label="Reports created" value={stats.total_reports} icon={FileText}/>
          <Stat label="Codes issued / used" value={`${activeCount + usedCount} / ${usedCount}`} icon={Ticket} last/>
        </div>
      )}

      {/* Business (seller) settings — prints on every GST tax invoice */}
      {seller && (
        <div className="border border-border bg-card p-6 mb-10" data-testid="seller-settings">
          <div className="flex items-center justify-between mb-4">
            <div className="label-caps flex items-center gap-2"><Building2 size={14}/> Business settings (invoice header)</div>
            <div className="text-xs text-muted-foreground">Applies to <b>new</b> invoices. Past invoices keep their original details.</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldInput label="Legal business name *" value={seller.business_name}
              onChange={v => setSeller({ ...seller, business_name: v })} testid="s-name"/>
            <FieldInput label="GSTIN *" value={seller.gstin} mono uppercase
              onChange={v => setSeller({ ...seller, gstin: v })} testid="s-gstin" maxLength={15}/>
            <FieldInput label="PAN" value={seller.pan || ""} mono uppercase
              onChange={v => setSeller({ ...seller, pan: v })} testid="s-pan" maxLength={10}/>
            <div>
              <label className="label-caps block mb-1">State *</label>
              <select value={seller.state || ""} onChange={e => {
                const st = states.find(s => s.name === e.target.value);
                setSeller({ ...seller, state: e.target.value, state_code: st?.code || "" });
              }} data-testid="s-state"
                className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select…</option>
                {states.map(s => <option key={s.code} value={s.name}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <FieldInput label="Address line 1 *" value={seller.address_line1 || ""}
              onChange={v => setSeller({ ...seller, address_line1: v })} testid="s-addr1"/>
            <FieldInput label="Address line 2 (city, PIN)" value={seller.address_line2 || ""}
              onChange={v => setSeller({ ...seller, address_line2: v })} testid="s-addr2"/>
            <FieldInput label="Contact email (for buyer replies)" value={seller.contact_email || ""}
              onChange={v => setSeller({ ...seller, contact_email: v })} testid="s-email"/>
            <FieldInput label="Phone" value={seller.phone || ""}
              onChange={v => setSeller({ ...seller, phone: v })} testid="s-phone"/>
            <FieldInput label="SAC code" value={seller.sac_code || "998314"} mono
              onChange={v => setSeller({ ...seller, sac_code: v })} testid="s-sac"/>
            <FieldInput label="Website" value={seller.website || ""}
              onChange={v => setSeller({ ...seller, website: v })} testid="s-web"/>
          </div>
          <div className="flex justify-end mt-6">
            <button onClick={saveSeller} disabled={savingSeller} className="btn-emerald" data-testid="s-save">
              <Save size={12} className="inline mr-2"/>
              {savingSeller ? "Saving…" : "Save business settings"}
            </button>
          </div>
        </div>
      )}

      {/* Code generator */}
      <div className="border border-border bg-card p-6 mb-10" data-testid="codes-generator">
        <div className="label-caps mb-4 flex items-center gap-2"><Ticket size={14}/> Generate activation codes</div>
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-4">
            <label className="label-caps block mb-1">Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" data-testid="gen-plan">
              {Object.values(plans).map(p => (
                <option key={p.id} value={p.id}>{p.label} — ₹{p.price_inr} / {p.days} days</option>
              ))}
            </select>
          </div>
          <div className="col-span-3">
            <label className="label-caps block mb-1">Count</label>
            <input type="number" min={1} max={500} value={count} onChange={e => setCount(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" data-testid="gen-count"/>
          </div>
          <div className="col-span-3">
            <button onClick={generate} disabled={busy} className="btn-emerald w-full" data-testid="gen-btn">
              {busy ? "Generating…" : "Generate"}
            </button>
          </div>
          <div className="col-span-2">
            <button onClick={copyAllActive} className="btn-outline w-full text-xs" data-testid="copy-all-btn">
              <Copy size={12} className="inline mr-1"/> Copy active
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* Codes list */}
        <div className="border border-border bg-card" data-testid="codes-list">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="label-caps">Codes ({codes.length})</div>
            <div className="text-xs text-muted-foreground">{activeCount} active · {usedCount} used</div>
          </div>
          <div className="max-h-[500px] overflow-auto">
            {codes.length === 0 && <div className="p-6 text-sm text-muted-foreground">No codes yet — generate some above.</div>}
            {codes.map((c) => (
              <div key={c.code} className="p-3 border-b border-border last:border-b-0 flex items-center gap-3 text-xs">
                <button onClick={() => copyCode(c.code)}
                  className="flex-1 text-left font-mono tracking-wider hover:text-primary"
                  data-testid={`copy-${c.code}`}>
                  {c.code}
                </button>
                <span className="text-muted-foreground w-20">{c.plan}</span>
                <span className={`text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-0.5 border ${c.status === "active" ? "border-primary text-primary" : "border-muted-foreground text-muted-foreground"}`}>
                  {c.status}
                </span>
                {c.used_by_email && <span className="text-muted-foreground truncate max-w-[140px]">{c.used_by_email}</span>}
                {copied === c.code ? <Check size={12} className="text-primary"/> : <Copy size={12} className="text-muted-foreground"/>}
              </div>
            ))}
          </div>
        </div>

        {/* Users */}
        <div className="border border-border bg-card" data-testid="users-list">
          <div className="p-4 border-b border-border label-caps">Users</div>
          <div className="max-h-[500px] overflow-auto">
            {users.map(u => (
              <div key={u.user_id} className="p-4 border-b border-border last:border-b-0 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{u.name || u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    {u.paid_until && (
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">expires {new Date(u.paid_until).toLocaleDateString("en-IN")}</div>
                    )}
                    {u.reports_quota !== undefined && (
                      <div className="text-[10px] font-mono text-primary mt-0.5" data-testid={`quota-${u.user_id}`}>quota: {u.reports_quota || 0} reports</div>
                    )}
                  </div>
                  <span className={`text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-0.5 border ${u.is_paid ? "border-primary text-primary" : "border-muted-foreground text-muted-foreground"}`}>
                    {u.is_paid ? "active" : "inactive"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sales & GST filings */}
      {salesSummary && (
        <div className="border border-border bg-card mb-10" data-testid="sales-gst-section">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <div className="label-caps flex items-center gap-2"><Receipt size={14}/> Sales & GST filings</div>
              <div className="text-xs text-muted-foreground mt-1">
                Downloadable reports for your CA — Sales register, GSTR-1 filing sheet, and individual GST invoices.
              </div>
            </div>
          </div>

          {/* Period totals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-border">
            <PeriodTile label="This month" data={salesSummary.this_month}/>
            <PeriodTile label="Last month" data={salesSummary.last_month} bordered/>
            <PeriodTile label="This FY (Apr-Mar)" data={salesSummary.this_fy}/>
          </div>

          {/* Export controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-b border-border">
            {/* Sales CSV */}
            <div className="p-6 md:border-r border-border">
              <div className="flex items-center gap-2 mb-4">
                <FileDown size={16} className="text-primary"/>
                <div className="font-serif text-xl">Sales register (CSV)</div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Full order list with buyer info, taxable value, GST breakdown, and totals — one row per order.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label-caps block mb-1">From</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    data-testid="sales-from" className="w-full border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"/>
                </div>
                <div>
                  <label className="label-caps block mb-1">To</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    data-testid="sales-to" className="w-full border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"/>
                </div>
              </div>
              <button onClick={downloadSalesCsv} className="btn-emerald w-full" data-testid="dl-sales-csv">
                <FileDown size={14} className="inline mr-2"/> Download sales CSV
              </button>
            </div>

            {/* GSTR-1 */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileSpreadsheet size={16} className="text-primary"/>
                <div className="font-serif text-xl">GSTR-1 filing sheet</div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Excel with <b>b2b</b> + <b>b2cs</b> tabs matching the GSTN offline utility template. Give this to your CA to upload directly.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="label-caps block mb-1">Month</label>
                  <select value={gstrMonth} onChange={e => setGstrMonth(Number(e.target.value))} data-testid="gstr-month"
                    className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {Array.from({length:12}, (_,i)=>i+1).map(m => <option key={m} value={m}>{String(m).padStart(2,"0")} — {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-caps block mb-1">Year</label>
                  <input type="number" min={2020} max={2100} value={gstrYear} onChange={e => setGstrYear(Number(e.target.value))}
                    data-testid="gstr-year" className="w-full border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"/>
                </div>
              </div>
              <button onClick={downloadGstr1} className="btn-emerald w-full" data-testid="dl-gstr1">
                <FileSpreadsheet size={14} className="inline mr-2"/> Download GSTR-1 Excel
              </button>
            </div>
          </div>

          {/* Orders list with per-order invoice download */}
          <div>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="label-caps">Recent orders ({orders.length})</div>
              <div className="text-[11px] text-muted-foreground">Newest first · showing last {Math.min(orders.length, 500)}</div>
            </div>
            <div className="max-h-[500px] overflow-auto">
              {orders.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground">No orders yet.</div>
              )}
              {orders.map(o => (
                <div key={o.order_id} className="p-3 border-b border-border last:border-b-0 flex items-center gap-3 text-xs hover:bg-muted/30" data-testid={`order-${o.order_id}`}>
                  <div className="w-24 font-mono text-[10px] text-muted-foreground shrink-0">
                    {o.invoice_generated_at ? new Date(o.invoice_generated_at).toLocaleDateString("en-IN") : (o.created_at ? new Date(o.created_at).toLocaleDateString("en-IN") : "—")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono truncate">{o.invoice_no || <span className="text-muted-foreground">draft</span>}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {o.buyer_name || o.user_email} · <b>{o.plan}</b>
                      {o.buyer_gstin ? <> · GSTIN {o.buyer_gstin}</> : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono">₹{Number(o.amount || 0).toLocaleString("en-IN", {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {o.status === "PAID" || o.code_delivered ? <span className="text-primary font-bold">PAID</span> : (o.status || "pending")}
                    </div>
                  </div>
                  <button onClick={() => downloadInvoice(o)} disabled={!o.invoice_no}
                    className="btn-outline text-[10px] px-3 py-1.5 disabled:opacity-40"
                    data-testid={`dl-invoice-${o.order_id}`}>
                    <Download size={11} className="inline mr-1"/> Invoice
                  </button>
                  <button onClick={() => resendEmail(o)} disabled={!o.code_delivered}
                    className={`text-[10px] px-2 py-1.5 border transition-colors disabled:opacity-30 ${o.email_sent === false ? "border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
                    data-testid={`resend-email-${o.order_id}`}
                    title={o.email_sent === false ? `Email send FAILED: ${o.email_error || "unknown"}` : (o.email_sent ? "Email delivered — click to resend" : "Resend activation email")}>
                    <Mail size={11}/>
                  </button>
                  <button onClick={() => deleteOrder(o)}
                    className="text-[10px] px-2 py-1.5 border border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    data-testid={`delete-order-${o.order_id}`} title="Delete this order">
                    <Trash2 size={11}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, last }) {
  return (
    <div className={`p-6 ${!last ? "md:border-r border-border" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps">{label}</div>
        <Icon size={16} strokeWidth={1.5} className="text-primary"/>
      </div>
      <div className="font-serif text-3xl num">{value}</div>
    </div>
  );
}

function FieldInput({ label, value, onChange, testid, mono, uppercase, maxLength }) {
  return (
    <div>
      <label className="label-caps block mb-1">{label}</label>
      <input value={value} maxLength={maxLength}
        onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        data-testid={testid}
        className={`w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${mono ? "font-mono tracking-wider" : ""}`}/>
    </div>
  );
}

function PeriodTile({ label, data, bordered }) {
  return (
    <div className={`p-6 ${bordered ? "md:border-x border-border" : ""}`}>
      <div className="label-caps mb-2">{label}</div>
      <div className="font-serif text-3xl num text-primary" data-testid={`period-${label.toLowerCase().replace(/[^a-z]+/g,"-")}`}>
        ₹{Number(data?.gross || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
      </div>
      <div className="text-[11px] text-muted-foreground font-mono mt-2 space-y-0.5">
        <div>Taxable ₹{Number(data?.taxable || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
        <div>GST collected ₹{Number(data?.gst || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
        <div className="text-primary">{data?.count || 0} order{(data?.count || 0) === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}
