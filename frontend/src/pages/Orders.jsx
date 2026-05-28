import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Pagination from "@/components/Pagination";

const STATUSES = ["all", "active", "waiting_delivery", "delivered", "completed", "cancelled", "disputed"];
const LIMIT = 20;

export default function Orders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const params = { skip, limit: LIMIT };
    if (filter !== "all") params.status = filter;
    api.get("/orders", { params }).then((r) => {
      setOrders(r.data);
      setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
    });
  }, [filter, skip]);

  useEffect(() => { setSkip(0); }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-zinc-500 mt-1">{total} order{total !== 1 && "s"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} data-testid={`order-filter-${s}`} onClick={() => setFilter(s)}
            className={`h-8 px-3 text-xs uppercase tracking-wider rounded-md border ${filter === s ? "bg-[#FFC83D] text-black border-[#FFC83D]" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"}`}
          >{s}</button>
        ))}
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr className="text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Order</th>
              <th className="text-left px-4 py-3">Listing</th>
              {user?.role === "admin" && <th className="text-left px-4 py-3">Seller</th>}
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-zinc-500">No orders.</td></tr>
            ) : orders.map((o) => (
              <tr key={o.id} data-testid={`order-row-${o.id}`} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                <td className="px-4 py-3 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 truncate max-w-[200px]">{o.listing?.title || "—"}</td>
                {user?.role === "admin" && <td className="px-4 py-3 flex items-center gap-2"><span className={o.seller?.availability_status === "ONLINE" ? "dot-online" : "dot-offline"} /> {o.seller?.username}</td>}
                <td className="px-4 py-3 font-semibold">${o.amount?.toFixed(2)}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(o.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/orders/${o.id}`} data-testid={`view-order-${o.id}`} className="text-[#FFC83D] hover:underline text-xs uppercase tracking-wider">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="orders-pagination" />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: "bg-[#FFC83D]/20 text-[#FFC83D]",
    pending: "bg-zinc-700 text-zinc-300",
    waiting_delivery: "bg-blue-500/20 text-blue-300",
    delivered: "bg-teal-500/20 text-teal-300",
    completed: "bg-emerald-500/20 text-emerald-300",
    cancelled: "bg-red-500/20 text-red-300",
    disputed: "bg-orange-500/20 text-orange-300",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${map[status] || "bg-zinc-700"}`}>{status}</span>;
}
