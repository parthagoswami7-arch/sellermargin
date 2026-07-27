import "@/App.css";
import "@/index.css";
import React from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Landing from "@/pages/Landing";
import AuthCallback from "@/pages/AuthCallback";
import Dashboard from "@/pages/Dashboard";
import NewReport from "@/pages/NewReport";
import CostPricesStep from "@/pages/CostPricesStep";
import ReturnsStep from "@/pages/ReturnsStep";
import ReportView from "@/pages/ReportView";
import CostPrices from "@/pages/CostPrices";
import Admin from "@/pages/Admin";
import Upgrade from "@/pages/Upgrade";
import ContactUs from "@/pages/ContactUs";
import Terms from "@/pages/Terms";
import RefundPolicy from "@/pages/RefundPolicy";
import { PaymentSuccess, PaymentCancel } from "@/pages/PaymentResult";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";

function AppRouter() {
  const location = useLocation();
  // Handle Emergent OAuth callback: URL fragment #session_id=...
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  const Shelled = ({ children }) => (
    <ProtectedRoute><AppShell>{children}</AppShell></ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Shelled><Dashboard /></Shelled>} />
      <Route path="/new-report" element={<Shelled><NewReport /></Shelled>} />
      <Route path="/report/:id/costs" element={<Shelled><CostPricesStep /></Shelled>} />
      <Route path="/report/:id/returns" element={<Shelled><ReturnsStep /></Shelled>} />
      <Route path="/report/:id" element={<Shelled><ReportView /></Shelled>} />
      <Route path="/cost-prices" element={<Shelled><CostPrices /></Shelled>} />
      <Route path="/history" element={<Shelled><Dashboard /></Shelled>} />
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AppShell><Admin /></AppShell></ProtectedRoute>} />
      <Route path="/upgrade" element={<Shelled><Upgrade /></Shelled>} />
      <Route path="/contact" element={<ContactUs />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/refunds" element={<RefundPolicy />} />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/payment/cancel" element={<PaymentCancel />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
