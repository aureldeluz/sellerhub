import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useNotifications } from "@/context/NotificationContext";
import { Search, Save, ThumbsUp, ThumbsDown, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/Pagination";

const LIMIT = 12;

function FeedbackModal({ seller, onClose, onSaved }) {
  const [rating, setRating] = useState("positive");
  const [comment, setComment] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/sellers/${seller.id}/feedback`, {
        rating, comment, customer_label: customerLabel || null,
      });
      toast.success("Feedback added");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose} data-testid="feedback-modal">
      <form onSubmit={submit} className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Add feedback for</div>
          <div className="font-display font-semibold text-lg">{seller.username}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" data-testid="feedback-positive-btn" onClick={() => setRating("positive")}
            className={`flex-1 h-10 rounded-md border flex items-center justify-center gap-2 ${rating === "positive" ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-zinc-800 bg-zinc-950 text-zinc-400"}`}>
            <ThumbsUp className="w-4 h-4" /> Positive
          </button>
          <button type="button" data-testid="feedback-negative-btn" onClick={() => setRating("negative")}
            className={`flex-1 h-10 rounded-md border flex items-center justify-center gap-2 ${rating === "negative" ? "border-red-400 bg-red-500/15 text-red-300" : "border-zinc-800 bg-zinc-950 text-zinc-400"}`}>
            <ThumbsDown className="w-4 h-4" /> Negative
          </button>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Customer label (optional, e.g. Skr***)</label>
          <input data-testid="feedback-customer-label" value={customerLabel} onChange={(e) => setCustomerLabel(e.target.value)}
            className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Comment</label>
          <textarea data-testid="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            className="w-full p-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-10 rounded-md border border-zinc-800 text-zinc-400 hover:text-white text-sm">Cancel</button>
          <button type="submit" disabled={busy} data-testid="feedback-submit-btn" className="flex-1 h-10 rounded-md bg-[#FFC83D] text-black font-semibold text-sm disabled:opacity-50">Save feedback</button>
        </div>
      </form>
    </div>
  );
}

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [q, setQ] = useState("");
  const [availability, setAvailability] = useState("all");
  const [editing, setEditing] = useState(null);
  const [feedbackFor, setFeedbackFor] = useState(null);
  const { sellerStatuses } = useNotifications();

  const fetch = async () => {
    const params = { skip, limit: LIMIT };
    if (q) params.q = q;
    if (availability !== "all") params.availability = availability;
    const r = await api.get("/admin/sellers", { params });
    setSellers(r.data);
    setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
    // fetch feedback stats for each seller
    const all = await Promise.all(r.data.map((s) =>
      api.get(`/admin/sellers/${s.id}/feedback-stats`).then((res) => [s.id, res.data]).catch(() => [s.id, null])
    ));
    setStats(Object.fromEntries(all));
  };
  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [availability, skip]);
  useEffect(() => { setSkip(0); }, [availability, q]);

  const saveNotes = async (sid, notes) => {
    await api.patch(`/admin/sellers/${sid}/notes`, { notes });
    toast.success("Notes saved");
    setEditing(null);
    fetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Sellers</h1>
          <p className="text-sm text-zinc-500 mt-1">{total} seller{total !== 1 && "s"}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input data-testid="sellers-search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetch()}
              placeholder="Search sellers..." className="h-9 bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 text-sm outline-none focus:border-[#FFC83D]/60" />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {["all", "ONLINE", "OFFLINE"].map((s) => (
          <button key={s} data-testid={`avail-filter-${s}`} onClick={() => setAvailability(s)} className={`h-8 px-3 text-xs uppercase tracking-wider rounded-md border ${availability === s ? "bg-[#FFC83D] text-black border-[#FFC83D]" : "bg-zinc-900 text-zinc-400 border-zinc-800"}`}>{s}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sellers.map((s) => {
          const live = sellerStatuses[s.id] || s.profile?.availability_status || "OFFLINE";
          const fs = stats[s.id] || { positive: 0, negative: 0, score: 0, completed_orders: 0 };
          return (
            <div key={s.id} data-testid={`seller-${s.id}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-display font-bold">{s.username[0]?.toUpperCase()}</div>
                  <div>
                    <div className="font-medium">{s.username}</div>
                    <div className="text-xs text-zinc-500">{s.email}</div>
                  </div>
                </div>
                <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded ${live === "ONLINE" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}>
                  <span className={live === "ONLINE" ? "dot-online" : "dot-offline"} /> {live}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center mb-4 border-t border-b border-zinc-800 py-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Completed</div>
                  <div className="font-display font-semibold text-lg" data-testid={`stat-completed-${s.id}`}>{fs.completed_orders}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400">Positive</div>
                  <div className="font-display font-semibold text-lg text-emerald-300" data-testid={`stat-positive-${s.id}`}>{fs.positive}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-red-400">Negative</div>
                  <div className="font-display font-semibold text-lg text-red-300" data-testid={`stat-negative-${s.id}`}>{fs.negative}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Score</div>
                  <div className="font-display font-semibold text-lg text-[#FFC83D]" data-testid={`stat-score-${s.id}`}>{fs.score}%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <button data-testid={`open-feedback-${s.id}`} onClick={() => setFeedbackFor(s)} className="h-8 px-3 rounded-md bg-[#FFC83D] text-black text-xs font-semibold flex items-center gap-1.5 hover:bg-[#E5B437]">
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Add feedback
                </button>
                <span className="text-xs text-zinc-500">Balance: <span className="text-white font-semibold">${(s.wallet?.available_balance ?? 0).toFixed(2)}</span></span>
              </div>
              <div>
                {editing === s.id ? (
                  <div className="space-y-2">
                    <textarea defaultValue={s.profile?.admin_notes} id={`notes-${s.id}`} rows={3}
                      className="w-full p-2 text-sm bg-zinc-950 border border-zinc-800 rounded-md outline-none" />
                    <button data-testid={`save-notes-${s.id}`} onClick={() => saveNotes(s.id, document.getElementById(`notes-${s.id}`).value)}
                      className="h-8 px-3 text-xs rounded-md bg-[#FFC83D] text-black font-semibold flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                  </div>
                ) : (
                  <div onClick={() => setEditing(s.id)} className="text-xs text-zinc-500 hover:text-white cursor-pointer">
                    <span className="uppercase tracking-wider">Internal notes:</span> {s.profile?.admin_notes || <em>click to add</em>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="sellers-pagination" />

      {feedbackFor && (
        <FeedbackModal seller={feedbackFor} onClose={() => setFeedbackFor(null)} onSaved={() => { setFeedbackFor(null); fetch(); }} />
      )}
    </div>
  );
}
