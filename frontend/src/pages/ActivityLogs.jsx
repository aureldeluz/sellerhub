import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { Activity, ArrowRightLeft, Image as ImageIcon, Trash2, Plus, Pencil, DollarSign, Type } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Pagination from "@/components/Pagination";

const ICON_MAP = {
  STATUS_ONLINE: ArrowRightLeft,
  STATUS_OFFLINE: ArrowRightLeft,
  LISTING_CREATED: Plus,
  LISTING_DELETED: Trash2,
  LISTING_PRICE_CHANGED: DollarSign,
  LISTING_TITLE_CHANGED: Type,
  LISTING_PHOTO_CHANGED: ImageIcon,
  LISTING_UPDATED: Pencil,
};

const LABEL = {
  STATUS_ONLINE: "Switched ONLINE",
  STATUS_OFFLINE: "Switched OFFLINE",
  LISTING_CREATED: "Created listing",
  LISTING_DELETED: "Deleted listing",
  LISTING_PRICE_CHANGED: "Changed price",
  LISTING_TITLE_CHANGED: "Changed title",
  LISTING_PHOTO_CHANGED: "Updated photo",
  LISTING_UPDATED: "Updated listing",
};

const FILTERS = [
  "all", "STATUS_ONLINE", "STATUS_OFFLINE",
  "LISTING_CREATED", "LISTING_DELETED",
  "LISTING_PRICE_CHANGED", "LISTING_TITLE_CHANGED", "LISTING_PHOTO_CHANGED", "LISTING_UPDATED",
];

const LIMIT = 25;

export default function ActivityLogs() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { on } = useNotifications();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState("all");

  const fetch = async () => {
    if (isAdmin) {
      const params = { skip, limit: LIMIT };
      if (filter !== "all") params.activity_type = filter;
      const r = await api.get("/admin/activity-logs", { params });
      setRows(r.data);
      setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
    } else {
      const r = await api.get("/seller/activity-logs", { params: { limit: 500 } });
      const all = filter === "all" ? r.data : r.data.filter((x) => x.activity_type === filter);
      setRows(all.slice(skip, skip + LIMIT));
      setTotal(all.length);
    }
  };
  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [filter, skip]);
  useEffect(() => { setSkip(0); }, [filter]);

  useEffect(() => {
    const off = on("seller_activity", () => fetch());
    return () => off();
    // eslint-disable-next-line
  }, [on]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">{isAdmin ? "Activity Logs" : "My Activity"}</h1>
        <p className="text-sm text-zinc-500 mt-1">{isAdmin ? "All seller activities" : "Your status & item changes"} · {total} entries · live</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} data-testid={`af-${f}`} onClick={() => setFilter(f)}
            className={`h-8 px-3 text-[11px] uppercase tracking-wider rounded-md border ${filter === f ? "bg-[#FFC83D] text-black border-[#FFC83D]" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"}`}>
            {f === "all" ? "All" : LABEL[f] || f}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-lg p-12 text-center text-zinc-500 text-sm">No activity yet.</div>
      ) : (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg">
          {rows.map((r, i) => {
            const Icon = ICON_MAP[r.activity_type] || Activity;
            const isStatus = r.activity_type?.startsWith("STATUS_");
            return (
              <div key={r.id} data-testid={`log-${i}`} className="flex items-start gap-4 px-5 py-4 border-b border-zinc-800/60 last:border-0">
                <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${isStatus ? "bg-[#FFC83D]/10 text-[#FFC83D]" : "bg-zinc-800 text-zinc-300"}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isAdmin && <span className="font-semibold">{r.seller_username}</span>}
                    <span className="text-sm">{LABEL[r.activity_type] || r.activity_type}</span>
                    {r.previous_value !== null && r.new_value !== null && (
                      <span className="text-xs text-zinc-500">
                        <span className="line-through text-red-400">{String(r.previous_value)}</span> → <span className="text-emerald-400">{String(r.new_value)}</span>
                      </span>
                    )}
                  </div>
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">
                      {Object.entries(r.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">
                    {r.created_at && formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="activity-pagination" />
    </div>
  );
}
