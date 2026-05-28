import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Package, ShoppingCart, Wallet as WalletIcon,
  MessageSquare, Bell, Users, Activity, AlertTriangle, Settings, LogOut, Gamepad2, ArrowDownToLine, Star,
} from "lucide-react";

const sellerNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/listings", label: "My Listings", icon: Package },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/withdrawals", label: "Withdrawals", icon: ArrowDownToLine },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/disputes", label: "Disputes", icon: AlertTriangle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/feedback", label: "Feedback", icon: Star },
  { to: "/activity", label: "My Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

const adminNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/listings", label: "All Listings", icon: Package },
  { to: "/orders", label: "Orders", icon: ShoppingCart },
  { to: "/sellers", label: "Sellers", icon: Users },
  { to: "/disputes", label: "Disputes", icon: AlertTriangle },
  { to: "/withdrawals", label: "Withdrawals", icon: ArrowDownToLine },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/activity", label: "Activity Logs", icon: Activity },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const items = user?.role === "admin" ? adminNav : sellerNav;
  const loc = useLocation();

  return (
    <aside data-testid="sidebar" className="hidden lg:flex flex-col w-64 shrink-0 border-r border-zinc-800/80 bg-zinc-950 sticky top-0 h-screen">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-zinc-800/80">
        <div className="w-8 h-8 rounded-md bg-[#FFC83D] flex items-center justify-center">
          <Gamepad2 className="w-4 h-4 text-black" />
        </div>
        <div className="font-display font-bold text-lg tracking-tight">SellerHub</div>
      </div>

      <div className="px-4 py-4 border-b border-zinc-800/80">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Signed in as</div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-display font-semibold text-sm">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{user?.username}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-wider">{user?.role}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const active = loc.pathname.startsWith(it.to);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.label.toLowerCase().replaceAll(" ", "-")}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active ? "bg-zinc-900 text-[#FFC83D] border-l-2 border-[#FFC83D] pl-[10px]" : "text-zinc-400 hover:text-white hover:bg-zinc-900/60"
              }`}
            >
              <it.icon className="w-4 h-4" />
              <span>{it.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <button
        data-testid="logout-btn"
        onClick={logout}
        className="flex items-center gap-3 px-5 py-3 text-sm text-zinc-400 hover:text-white border-t border-zinc-800/80"
      >
        <LogOut className="w-4 h-4" /> Logout
      </button>
    </aside>
  );
}
