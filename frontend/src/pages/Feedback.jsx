import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Star, ThumbsUp, ThumbsDown, ArrowLeftRight } from "lucide-react";
import Pagination from "@/components/Pagination";

const LIMIT = 20;

export default function Feedback() {
  const [stats, setStats] = useState({ completed_orders: 0, positive: 0, negative: 0, score: 0 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState("all");

  const fetch = async () => {
    const [s, list] = await Promise.all([
      api.get("/feedback/stats"),
      api.get("/feedback", { params: { skip, limit: LIMIT, ...(filter === "all" ? {} : { rating: filter }) } }),
    ]);
    setStats(s.data);
    setRows(list.data);
    setTotal(parseInt(list.headers["x-total-count"] || list.data.length));
  };
  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [filter, skip]);
  useEffect(() => { setSkip(0); }, [filter]);

  const fmtDaysAgo = (iso) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (diff < 1) return "today";
    const d = Math.floor(diff);
    return `${d} day${d !== 1 ? "s" : ""} ago`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Star className="w-7 h-7 text-[#FFC83D] fill-[#FFC83D]" />
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Feedback</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <ArrowLeftRight className="w-5 h-5 text-sky-400 mb-3" />
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Completed orders</div>
          <div className="font-display font-bold text-3xl mt-1" data-testid="stat-completed">{stats.completed_orders}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <ThumbsUp className="w-5 h-5 text-emerald-400 mb-3" />
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Positive feedback</div>
          <div className="font-display font-bold text-3xl mt-1" data-testid="stat-positive">{stats.positive}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <ThumbsDown className="w-5 h-5 text-red-400 mb-3" />
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Negative feedback</div>
          <div className="font-display font-bold text-3xl mt-1" data-testid="stat-negative">{stats.negative}</div>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <Star className="w-5 h-5 text-[#FFC83D] mb-3" />
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Feedback score</div>
          <div className="font-display font-bold text-3xl mt-1 text-[#FFC83D]" data-testid="stat-score">{stats.score}%</div>
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { key: "all", label: "All" },
          { key: "positive", label: "Positive", icon: ThumbsUp },
          { key: "negative", label: "Negative", icon: ThumbsDown },
        ].map((f) => (
          <button key={f.key} data-testid={`fb-filter-${f.key}`} onClick={() => setFilter(f.key)}
            className={`h-9 px-4 text-sm rounded-md flex items-center gap-1.5 ${filter === f.key ? "bg-[#FFC83D] text-black font-semibold" : "bg-zinc-900 text-zinc-400 border border-zinc-800"}`}>
            {f.label}
            {f.icon && <f.icon className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-lg p-12 text-center text-sm text-zinc-500">
            No feedback yet.
          </div>
        ) : rows.map((f) => (
          <div key={f.id} data-testid={`fb-row-${f.id}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {f.rating === "positive" ? (
                  <ThumbsUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ThumbsDown className="w-5 h-5 text-red-400" />
                )}
                <span className="text-sky-400 text-sm font-medium">Items</span>
                {f.customer_label && <span className="text-zinc-400 text-sm">| {f.customer_label}</span>}
              </div>
              <div className="text-xs text-zinc-500">{fmtDaysAgo(f.created_at)}</div>
            </div>
            {f.comment && <div className="text-sm text-zinc-300 mt-2 ml-8">{f.comment}</div>}
          </div>
        ))}
      </div>
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="feedback-pagination" />
    </div>
  );
}
