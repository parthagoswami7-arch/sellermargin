import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { Users, IndianRupee, FileText, Sparkles } from "lucide-react";

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    (async () => {
      const s = await api.get("/admin/stats"); setStats(s.data);
      const u = await api.get("/admin/users"); setUsers(u.data.users || []);
      const p = await api.get("/admin/payments"); setPayments(p.data.payments || []);
    })();
  }, []);

  return (
    <div className="p-10 max-w-[1400px]">
      <div className="label-caps mb-2">Admin</div>
      <h1 className="font-serif text-5xl tracking-tight mb-8">Owner console</h1>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 border border-border mb-10">
          <Stat label="Total users" value={stats.total_users} icon={Users}/>
          <Stat label="Paid users" value={stats.paid_users} icon={Sparkles} last={false}/>
          <Stat label="Reports created" value={stats.total_reports} icon={FileText}/>
          <Stat label="Revenue (test $)" value={`$ ${stats.revenue_usd.toFixed(2)}`} icon={IndianRupee} last/>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border bg-card">
          <div className="p-4 border-b border-border label-caps">Users</div>
          <div className="max-h-[500px] overflow-auto">
            {users.map(u => (
              <div key={u.user_id} className="p-4 border-b border-border last:border-b-0 text-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.name || u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-[0.15em] font-bold px-2 py-0.5 border ${u.is_paid ? "border-primary text-primary" : "border-accent text-accent"}`}>
                    {u.is_paid ? "paid" : "trial"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border bg-card">
          <div className="p-4 border-b border-border label-caps">Payments</div>
          <div className="max-h-[500px] overflow-auto">
            {payments.length === 0 && <div className="p-6 text-sm text-muted-foreground">No payments yet.</div>}
            {payments.map(p => (
              <div key={p.session_id} className="p-4 border-b border-border last:border-b-0 text-xs num">
                <div className="flex items-center justify-between">
                  <div className="truncate flex-1">{p.session_id}</div>
                  <div className="ml-4">$ {Number(p.amount).toFixed(2)}</div>
                </div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">
                  {p.payment_status} · {new Date(p.created_at).toLocaleString()}
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
