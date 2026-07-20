import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { Users, IndianRupee, FileText, Sparkles, Ticket, Copy, Check, Building2, Save } from "lucide-react";
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

  const loadAll = async () => {
    const [s, u, c, p, sl, st] = await Promise.all([
      api.get("/admin/stats"),
      api.get("/admin/users"),
      api.get("/admin/codes"),
      api.get("/plans"),
      api.get("/admin/settings/seller"),
      api.get("/settings/india-states"),
    ]);
    setStats(s.data);
    setUsers(u.data.users || []);
    setCodes(c.data.codes || []);
    setPlans(p.data.plans || {});
    setSeller(sl.data.seller || null);
    setStates(st.data.states || []);
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
      <div className="border border-border bg-card p-6 mb-10">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Codes list */}
        <div className="border border-border bg-card">
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
        <div className="border border-border bg-card">
          <div className="p-4 border-b border-border label-caps">Users</div>
          <div className="max-h-[500px] overflow-auto">
            {users.map(u => (
              <div key={u.user_id} className="p-4 border-b border-border last:border-b-0 text-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.name || u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    {u.paid_until && (
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">expires {new Date(u.paid_until).toLocaleDateString("en-IN")}</div>
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
