import React from "react";
import { useAuth } from "../context/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  // location.state may contain a hint from AuthCallback that user was just created
  const hint = location.state?.user;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user && !hint) return <Navigate to="/" replace state={{ from: location }} />;
  if (requireAdmin && !(user?.status?.is_admin)) return <Navigate to="/dashboard" replace />;
  return children;
}
