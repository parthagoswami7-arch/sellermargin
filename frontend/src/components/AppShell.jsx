import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ChartLine, Layers, DollarSign, History as HistoryIcon, ShieldCheck, LogOut, Sparkles, Menu, X } from "lucide-react";
import { Toaster } from "sonner";
import WhatsAppFab from "./WhatsAppFab";

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const status = user?.status || {};
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-close the drawer whenever the route changes
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

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

  const SidebarContent = (
    <>
      <div className="px-6 py-6 border-b border-border flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3" data-testid="brand-link">
          <img src="/brand/logo.png" alt="Seller Margin" className="h-9 w-9 object-contain shrink-0"/>
          <div>
            <div className="font-serif text-lg leading-none tracking-tight">Seller Margin</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-1">Amazon P&amp;L</div>
          </div>
        </Link>
        <button className="md:hidden text-muted-foreground" onClick={() => setMobileOpen(false)} data-testid="mobile-nav-close" aria-label="Close menu">
          <X size={22}/>
        </button>
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
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col">
        {SidebarContent}
      </aside>

      {/* Mobile drawer + overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} data-testid="mobile-nav-overlay"/>
      )}
      <aside className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85%] bg-card border-r border-border flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} data-testid="mobile-nav-drawer">
        {SidebarContent}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 text-foreground" data-testid="mobile-nav-open" aria-label="Open menu">
            <Menu size={22}/>
          </button>
          <Link to="/" className="flex items-center gap-2" data-testid="mobile-brand-link">
            <img src="/brand/logo.png" alt="" className="h-7 w-7 object-contain"/>
            <div className="font-serif text-base tracking-tight">Seller Margin</div>
          </Link>
          <button onClick={() => nav("/upgrade")} className="text-[10px] uppercase tracking-[0.12em] font-bold bg-primary text-primary-foreground px-3 py-1.5" data-testid="mobile-upgrade-btn">
            Upgrade
          </button>
        </div>

        {!status.is_paid && (
          <div className="bg-primary text-primary-foreground px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-primary">
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
              <Sparkles size={16} className="shrink-0"/>
              <span className="font-mono">No active plan</span>
              <span className="opacity-70 hidden sm:inline">— ₹49 / 10 days or ₹499 / 1 year</span>
            </div>
            <button onClick={() => nav("/upgrade")} className="bg-accent text-accent-foreground px-4 py-1.5 text-xs uppercase tracking-[0.15em] font-bold hover:brightness-95 self-start sm:self-auto" data-testid="upgrade-btn-banner">
              Buy now
            </button>
          </div>
        )}
        {status.is_paid && status.paid_days_left <= 30 && (
          <div className="bg-accent/15 border-b border-accent/40 px-4 md:px-8 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div className="text-xs text-foreground">
              <span className="font-bold">Renewal:</span> {status.paid_days_left} day{status.paid_days_left === 1 ? "" : "s"} left on your annual plan.
            </div>
            <button onClick={() => nav("/upgrade")} className="text-xs uppercase tracking-[0.15em] font-bold text-primary hover:underline self-start sm:self-auto" data-testid="renew-btn-banner">
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
