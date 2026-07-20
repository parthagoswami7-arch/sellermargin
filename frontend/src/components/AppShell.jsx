import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChartLine, Layers, DollarSign, History as HistoryIcon, ShieldCheck, LogOut, Sparkles, MessageCircle } from "lucide-react";
import { Toaster } from "sonner";
import WhatsAppFab, { whatsappLink } from "./WhatsAppFab";

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
          <Link to="/dashboard" className="flex items-center gap-3" data-testid="brand-link">
            <img src="/brand/logo.png" alt="Seller Margin" className="h-9 w-9 object-contain shrink-0"/>
            <div>
              <div className="font-serif text-lg leading-none tracking-tight">Seller Margin</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-1">Amazon P&amp;L</div>
            </div>
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
                No active plan
              </span>
              <span className="opacity-70">— redeem an activation code to unlock (₹49 / 10 days or ₹499 / 1 year)</span>
            </div>
            <button onClick={() => nav("/upgrade")} className="bg-accent text-accent-foreground px-4 py-1.5 text-xs uppercase tracking-[0.15em] font-bold hover:brightness-95" data-testid="upgrade-btn-banner">
              Redeem code
            </button>
          </div>
        )}
        {status.is_paid && status.paid_days_left <= 30 && (
          <div className="bg-accent/15 border-b border-accent/40 px-8 py-2 flex items-center justify-between">
            <div className="text-xs text-foreground">
              <span className="font-bold">Renewal:</span> {status.paid_days_left} day{status.paid_days_left === 1 ? "" : "s"} left on your annual plan.
            </div>
            <button onClick={() => nav("/upgrade")} className="text-xs uppercase tracking-[0.15em] font-bold text-primary hover:underline" data-testid="renew-btn-banner">
              Renew now
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
      <Toaster position="bottom-right" richColors />
      <WhatsAppFab message={`Hi, I need help with Seller Margin. My email is ${user?.email || "—"}`}/>
    </div>
  );
}
