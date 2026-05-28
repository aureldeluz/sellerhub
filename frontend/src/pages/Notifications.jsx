import { useNotifications } from "@/context/NotificationContext";
import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import Pagination from "@/components/Pagination";

const LIMIT = 25;

export default function Notifications() {
  const { markRead, markAllRead, unread } = useNotifications();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState("all");

  const fetch = async () => {
    const params = { skip, limit: LIMIT };
    if (filter === "unread") params.unread_only = true;
    const r = await api.get("/notifications", { params });
    let data = r.data;
    if (filter === "read") data = data.filter((n) => n.is_read);
    setItems(data);
    setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
  };
  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [filter, skip]);
  useEffect(() => { setSkip(0); }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-zinc-500 mt-1">{unread} unread · {total} total</p>
        </div>
        {unread > 0 && (
          <button data-testid="mark-all-read" onClick={() => { markAllRead(); fetch(); }} className="h-9 px-3 text-sm rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>
      <div className="flex gap-2">
        {["all", "unread", "read"].map((s) => (
          <button key={s} data-testid={`nf-${s}`} onClick={() => setFilter(s)} className={`h-8 px-3 text-xs uppercase tracking-wider rounded-md border ${filter === s ? "bg-[#FFC83D] text-black border-[#FFC83D]" : "bg-zinc-900 text-zinc-400 border-zinc-800"}`}>{s}</button>
        ))}
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {items.length === 0 ? (
          <div className="px-5 py-12 text-center text-zinc-500 text-sm">No notifications.</div>
        ) : items.map((n) => (
          <div key={n.id} onClick={() => !n.is_read && (markRead(n.id), fetch())} className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-zinc-900/80 ${!n.is_read ? "border-l-2 border-l-[#FFC83D] bg-zinc-900/30" : ""}`}>
            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${!n.is_read ? "bg-[#FFC83D]/10 text-[#FFC83D]" : "bg-zinc-800 text-zinc-500"}`}>
              <Bell className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-sm text-zinc-400 mt-0.5">{n.message}</div>
              <div className="text-[10px] text-zinc-600 mt-1 uppercase tracking-wider">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })} · {n.type}</div>
            </div>
          </div>
        ))}
      </div>
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="notif-pagination" />
    </div>
  );
}
