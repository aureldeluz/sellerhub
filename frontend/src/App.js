import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import AppShell from "@/components/layout/AppShell";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import Dashboard from "@/pages/Dashboard";
import Listings from "@/pages/Listings";
import ListingForm from "@/pages/ListingForm";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Messages from "@/pages/Messages";
import Wallet from "@/pages/Wallet";
import Withdraw from "@/pages/Withdraw";
import Withdrawals from "@/pages/Withdrawals";
import Disputes from "@/pages/Disputes";
import Sellers from "@/pages/Sellers";
import ActivityLogs from "@/pages/ActivityLogs";
import NotificationsPage from "@/pages/Notifications";
import Settings from "@/pages/Settings";
import Feedback from "@/pages/Feedback";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireSeller({ children }) {
  const { user } = useAuth();
  if (user?.role !== "seller") return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/listings" element={<RequireAuth><Listings /></RequireAuth>} />
      <Route path="/listings/new" element={<RequireAuth><RequireSeller><ListingForm /></RequireSeller></RequireAuth>} />
      <Route path="/listings/:id/edit" element={<RequireAuth><ListingForm /></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
      <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
      <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
      <Route path="/wallet" element={<RequireAuth><RequireSeller><Wallet /></RequireSeller></RequireAuth>} />
      <Route path="/wallet/withdraw" element={<RequireAuth><RequireSeller><Withdraw /></RequireSeller></RequireAuth>} />
      <Route path="/withdrawals" element={<RequireAuth><Withdrawals /></RequireAuth>} />
      <Route path="/disputes" element={<RequireAuth><Disputes /></RequireAuth>} />
      <Route path="/sellers" element={<RequireAuth><RequireAdmin><Sellers /></RequireAdmin></RequireAuth>} />
      <Route path="/activity" element={<RequireAuth><ActivityLogs /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route path="/feedback" element={<RequireAuth><RequireSeller><Feedback /></RequireSeller></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
          <Toaster theme="dark" position="top-right" toastOptions={{
            style: { background: "#18181b", border: "1px solid #27272a", color: "#fafafa" }
          }} />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
