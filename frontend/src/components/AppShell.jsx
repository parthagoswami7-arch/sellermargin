import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChartLine, Layers, DollarSign, History as HistoryIcon, ShieldCheck, LogOut, Sparkles } from "lucide-react";
import { Toaster } from "sonner";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const status = user?.status || {};
  const trialLeft = status.trial_days_left;

  const NavLink = ({ to, icon: Icon, label, tid }) => {
    const active = loc.pathname === to || (to !== "/dashboard" && loc.pathname.startsWith(to));
    return (
      <Link to={to} data-testid={tid}
        className={`flex items-center gap-3 px-4 py-3 text-sm border-l-2 transition-colors ${
          active ? "border-primary bg-primary/5 text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}>
        <Icon size={16} strokeWidth={1.5} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="px-6 py-6 border-b border-border">
          <Link to="/dashboard" className="block" data-testid="brand-link">
            <div className="font-serif text-2xl leading-none tracking-tight">Ledger<span className="text-primary">.</span></div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-1">Amazon P&L</div>
          </Link>
        </div>
        <nav className="flex-1 py-4">
          <NavLink to="/dashboard" icon={ChartLine} label="Reports" tid="nav-reports" />
          <NavLink to="/new-report" icon={Layers} label="New Report" tid="nav-new" />
          <NavLink to="/cost-prices" icon={DollarSign} label="Cost Prices" tid="nav-costs" />
          <NavLink to="/history" icon={HistoryIcon} label="History" tid="nav-history" />
          {status.is_admin && <NavLink to="/admin" icon={ShieldCheck} label="Admin" tid="nav-admin" />}
        </nav>
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                {(user?.name || user?.email || "U")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user?.name || "User"}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
          <button onClick={logout} className="btn-ghost w-full text-left" data-testid="logout-btn">
            <LogOut size={14} className="inline mr-2" /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {!status.is_paid && (
          <div className="bg-primary text-primary-foreground px-8 py-3 flex items-center justify-between border-b border-primary">
            <div className="flex items-center gap-3 text-sm">
              <Sparkles size={16} />
              <span className="font-mono">
                {trialLeft > 0 ? `${trialLeft} day${trialLeft === 1 ? "" : "s"} left in trial` : "Trial expired"}
              </span>
              <span className="opacity-70">— Unlock lifetime access for ₹249</span>
            </div>
            <button onClick={() => nav("/upgrade")} className="bg-accent text-accent-foreground px-4 py-1.5 text-xs uppercase tracking-[0.15em] font-bold hover:brightness-95" data-testid="upgrade-btn-banner">
              Upgrade to Lifetime
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
