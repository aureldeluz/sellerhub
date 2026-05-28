import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  ShoppingCart, Package, AlertTriangle, Users, DollarSign, TrendingUp, Activity, Wallet as WalletIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

function StatCard({ label, value, icon: Icon, accent, testid }) {
  return (
    <div data-testid={testid} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 card-hover">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${accent || "bg-zinc-800 text-zinc-400"}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="font-display text-3xl font-semibold">{value}</div>
    </div>
  );
}

const PIE_COLORS = ["#FFC83D", "#22C55E", "#3B82F6", "#EC4899", "#A855F7", "#F97316", "#EF4444"];

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    api.get("/admin/analytics", { params: { days } }).then((r) => setAnalytics(r.data)).catch(() => {});
  }, [days]);

  if (!stats) return <div className="text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Operations dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">Real-time overview of orders, sellers, and disputes.</p>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-md">
          {[7, 14, 30].map((d) => (
            <button key={d} data-testid={`range-${d}`} onClick={() => setDays(d)}
              className={`h-8 px-3 text-xs uppercase tracking-wider rounded ${days === d ? "bg-[#FFC83D] text-black font-semibold" : "text-zinc-400 hover:text-white"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testid="stat-active-orders" label="Active orders" value={stats.orders.active} icon={ShoppingCart} accent="bg-[#FFC83D]/10 text-[#FFC83D]" />
        <StatCard testid="stat-pending-orders" label="Pending orders" value={stats.orders.pending} icon={Activity} />
        <StatCard testid="stat-completed-orders" label="Completed" value={stats.orders.completed} icon={TrendingUp} accent="bg-emerald-500/10 text-emerald-400" />
        <StatCard testid="stat-cancelled-orders" label="Cancelled" value={stats.orders.cancelled} icon={AlertTriangle} accent="bg-red-500/10 text-red-400" />
        <StatCard testid="stat-disputes" label="Open disputes" value={stats.disputes_open} icon={AlertTriangle} accent="bg-red-500/10 text-red-400" />
        <StatCard testid="stat-sellers" label={`Sellers (online ${stats.sellers.online})`} value={stats.sellers.total} icon={Users} />
        <StatCard testid="stat-listings" label="Active listings" value={stats.listings.active} icon={Package} />
        <StatCard testid="stat-revenue" label="Revenue" value={`$${stats.revenue.toFixed(2)}`} icon={DollarSign} accent="bg-emerald-500/10 text-emerald-400" />
      </div>

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div data-testid="chart-revenue" className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-display font-semibold">Revenue & orders trend</div>
                <div className="text-xs text-zinc-500">Last {days} days</div>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFC83D" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#FFC83D" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, color: "#fafafa" }} labelStyle={{ color: "#a1a1aa" }} />
                  <Area type="monotone" dataKey="revenue" stroke="#FFC83D" strokeWidth={2} fillOpacity={1} fill="url(#revFill)" name="Revenue $" />
                  <Line type="monotone" dataKey="orders" stroke="#22C55E" strokeWidth={2} dot={false} name="Orders" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div data-testid="chart-status" className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="font-display font-semibold mb-1">Order status</div>
            <div className="text-xs text-zinc-500 mb-4">Live breakdown</div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.status_breakdown} dataKey="count" nameKey="status" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {analytics.status_breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {analytics.status_breakdown.map((s, i) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-zinc-400 uppercase tracking-wider">{s.status}</span>
                  <span className="ml-auto text-white font-semibold">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div data-testid="chart-categories" className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="font-display font-semibold mb-4">Top categories (completed orders)</div>
            <div className="h-64">
              {analytics.top_categories.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm">No completed orders yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.top_categories} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                    <XAxis dataKey="category" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#FFC83D" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <Link to="/sellers" className="block bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 card-hover">
              <Users className="w-6 h-6 text-[#FFC83D] mb-3" />
              <div className="font-display text-lg font-semibold">Active sellers (last {days}d)</div>
              <div className="font-display text-4xl font-bold text-[#FFC83D] mt-2">{analytics.active_sellers_count}</div>
              <p className="text-xs text-zinc-500 mt-1">With recorded activity</p>
            </Link>
            <Link to="/withdrawals" className="block bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 card-hover">
              <WalletIcon className="w-6 h-6 text-[#FFC83D] mb-3" />
              <div className="font-display text-lg font-semibold">Pending payouts</div>
              <div className="font-display text-4xl font-bold mt-2">{stats.withdrawals_pending}</div>
              <p className="text-xs text-zinc-500 mt-1">Awaiting approval</p>
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link to="/orders" className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 card-hover">
          <ShoppingCart className="w-6 h-6 text-[#FFC83D] mb-3" />
          <div className="font-display text-lg font-semibold">Manage Orders</div>
          <p className="text-sm text-zinc-500 mt-1">Process active orders & finalize completion.</p>
        </Link>
        <Link to="/sellers" className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 card-hover">
          <Users className="w-6 h-6 text-[#FFC83D] mb-3" />
          <div className="font-display text-lg font-semibold">Seller Management</div>
          <p className="text-sm text-zinc-500 mt-1">Adjust ratings, internal notes, monitor availability.</p>
        </Link>
        <Link to="/disputes" className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 card-hover">
          <AlertTriangle className="w-6 h-6 text-[#FFC83D] mb-3" />
          <div className="font-display text-lg font-semibold">Disputes ({stats.disputes_open})</div>
          <p className="text-sm text-zinc-500 mt-1">Review and resolve open disputes.</p>
        </Link>
      </div>
    </div>
  );
}

function SellerDashboard() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  useEffect(() => {
    Promise.all([
      api.get("/wallet").then((r) => setWallet(r.data)),
      api.get("/orders", { params: { limit: 5 } }).then((r) => setOrders(r.data)),
      api.get("/listings", { params: { limit: 5 } }).then((r) => setListings(r.data)),
    ]).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Welcome back, {user?.username}</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage your listings, orders, and earnings.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testid="stat-balance" label="Available balance" value={`$${(wallet?.available_balance || 0).toFixed(2)}`} icon={WalletIcon} accent="bg-emerald-500/10 text-emerald-400" />
        <StatCard testid="stat-pending" label="Pending sales" value={`$${(wallet?.pending_balance || 0).toFixed(2)}`} icon={Activity} accent="bg-[#FFC83D]/10 text-[#FFC83D]" />
        <StatCard testid="stat-rating" label="Seller rating" value={(user?.profile?.rating ?? 5).toFixed(2)} icon={TrendingUp} />
        <StatCard testid="stat-completed" label="Completed orders" value={user?.profile?.total_completed_orders ?? 0} icon={Package} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold">Recent orders</h2>
            <Link to="/orders" className="text-xs text-[#FFC83D] hover:underline">View all</Link>
          </div>
          {orders.length === 0 ? (
            <p className="text-sm text-zinc-500">No orders yet.</p>
          ) : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-sm py-2 border-b border-zinc-800/60 last:border-0">
                  <Link to={`/orders/${o.id}`} className="hover:text-[#FFC83D] truncate">{o.listing?.title || "Order"} <span className="text-zinc-600">#{o.id.slice(0, 6)}</span></Link>
                  <span className="text-xs uppercase tracking-wider text-zinc-500">{o.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold">My listings</h2>
            <Link to="/listings" className="text-xs text-[#FFC83D] hover:underline">Manage</Link>
          </div>
          {listings.length === 0 ? (
            <p className="text-sm text-zinc-500">No listings. <Link to="/listings/new" className="text-[#FFC83D] hover:underline">Create one</Link>.</p>
          ) : (
            <ul className="space-y-2">
              {listings.map((l) => (
                <li key={l.id} className="flex items-center justify-between text-sm py-2 border-b border-zinc-800/60 last:border-0">
                  <span className="truncate">{l.title}</span>
                  <span className="text-xs uppercase tracking-wider text-zinc-500">{l.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  return user?.role === "admin" ? <AdminDashboard /> : <SellerDashboard />;
}
