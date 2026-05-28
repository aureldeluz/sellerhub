import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export default function Disputes() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/disputes");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to load disputes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const resolve = async (id, status) => {
    const note = window.prompt("Resolution note (optional)") || "";
    try {
      await api.patch(`/disputes/${id}`, { resolution_status: status, admin_notes: note });
      toast.success("Dispute updated");
      fetch();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update dispute");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-zinc-500 mt-1">{rows.length} dispute{rows.length !== 1 && "s"}</p>
      </div>
      {loading ? (
        <div className="text-zinc-500 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-lg p-12 text-center text-zinc-500 text-sm flex flex-col items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-zinc-600" />
          No disputes yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((d) => {
            const title = d?.order?.listing?.title || `Order #${d.order_id?.slice(0, 6) || "?"}`;
            const status = d.resolution_status || "open";
            return (
              <div key={d.id} data-testid={`dispute-${d.id}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Link to={`/orders/${d.order_id}`} className="font-display font-semibold hover:text-[#FFC83D]">
                      {title} <span className="text-zinc-500 text-xs">#{d.order_id?.slice(0, 6)}</span>
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.created_at ? new Date(d.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${status === "open" ? "bg-orange-500/20 text-orange-300" : "bg-emerald-500/20 text-emerald-300"}`}>{status}</span>
                </div>
                <p className="text-sm text-zinc-300 mb-2"><span className="text-zinc-500">Reason: </span>{d.reason || "—"}</p>
                {d.admin_notes && <p className="text-xs text-zinc-500"><span className="uppercase tracking-wider">Notes: </span>{d.admin_notes}</p>}
                {isAdmin && status === "open" && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button data-testid={`resolve-buyer-${d.id}`} onClick={() => resolve(d.id, "resolved_buyer")} className="h-8 px-3 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700">Resolve · Buyer</button>
                    <button data-testid={`resolve-seller-${d.id}`} onClick={() => resolve(d.id, "resolved_seller")} className="h-8 px-3 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700">Resolve · Seller</button>
                    <button data-testid={`close-${d.id}`} onClick={() => resolve(d.id, "closed")} className="h-8 px-3 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700">Close</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
