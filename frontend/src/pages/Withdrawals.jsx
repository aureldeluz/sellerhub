import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Check, X, Eye } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/Pagination";

const LIMIT = 20;

function PayoutDetails({ method, details }) {
  if (!details) return <span className="text-zinc-500">—</span>;
  if (method === "e_wallet") {
    return (
      <div className="space-y-1 text-sm">
        <div><span className="text-zinc-500">Provider:</span> <span className="uppercase">{details.provider}</span></div>
        <div><span className="text-zinc-500">Account #:</span> <span className="font-mono">{details.account_number}</span></div>
      </div>
    );
  }
  if (method === "bank_transfer") {
    return (
      <div className="space-y-1 text-sm">
        <div><span className="text-zinc-500">Bank:</span> {details.bank_name}</div>
        <div><span className="text-zinc-500">Holder:</span> {details.account_holder}</div>
        <div><span className="text-zinc-500">Account #:</span> <span className="font-mono">{details.account_number}</span></div>
      </div>
    );
  }
  if (method === "solana") {
    return (
      <div className="space-y-1 text-sm">
        <div><span className="text-zinc-500">Solana address:</span></div>
        <div className="font-mono text-xs break-all">{details.solana_address}</div>
      </div>
    );
  }
  return <pre className="text-xs">{JSON.stringify(details, null, 2)}</pre>;
}

export default function Withdrawals() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [filter, setFilter] = useState("all");
  const [viewing, setViewing] = useState(null);

  const fetch = async () => {
    const params = { skip, limit: LIMIT };
    if (filter !== "all") params.status = filter;
    const r = await api.get("/wallet/withdrawals", { params });
    setRows(r.data);
    setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
  };
  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [filter, skip]);
  useEffect(() => { setSkip(0); }, [filter]);

  const process = async (id, status) => {
    const note = status === "rejected" ? prompt("Rejection note") || "" : "";
    await api.patch(`/wallet/withdrawals/${id}`, { status, admin_notes: note });
    toast.success(`Withdrawal ${status}`);
    setViewing(null);
    fetch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Withdrawals</h1>
        <p className="text-sm text-zinc-500 mt-1">{total} request{total !== 1 && "s"}</p>
      </div>
      <div className="flex gap-2">
        {["all", "pending", "approved", "rejected"].map((s) => (
          <button key={s} data-testid={`wfilter-${s}`} onClick={() => setFilter(s)} className={`h-8 px-3 text-xs uppercase tracking-wider rounded-md border ${filter === s ? "bg-[#FFC83D] text-black border-[#FFC83D]" : "bg-zinc-900 text-zinc-400 border-zinc-800"}`}>{s}</button>
        ))}
      </div>
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 border-b border-zinc-800">
            <tr className="text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Ref</th>
              <th className="text-left px-4 py-3">Date</th>
              {isAdmin && <th className="text-left px-4 py-3">Seller</th>}
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-zinc-500">No requests.</td></tr>
            ) : rows.map((w) => (
              <tr key={w.id} data-testid={`w-row-${w.id}`} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                <td className="px-4 py-3 font-mono text-xs text-[#FFC83D]" data-testid={`w-ref-${w.id}`}>{w.ref_no || w.id.slice(0, 8).toUpperCase()}</td>
                <td className="px-4 py-3 text-xs text-zinc-400">{new Date(w.created_at).toLocaleString()}</td>
                {isAdmin && <td className="px-4 py-3">{w.seller_username}</td>}
                <td className="px-4 py-3 font-semibold">${w.amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-xs uppercase tracking-wider">{w.method.replaceAll("_", " ")}</td>
                <td className="px-4 py-3"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${w.status === "approved" ? "bg-emerald-500/20 text-emerald-300" : w.status === "rejected" ? "bg-red-500/20 text-red-300" : "bg-zinc-700 text-zinc-300"}`}>{w.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    {isAdmin && (
                      <button data-testid={`view-${w.id}`} onClick={() => setViewing(w)} className="h-7 w-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isAdmin && w.status === "pending" && (
                      <>
                        <button data-testid={`approve-${w.id}`} onClick={() => process(w.id, "approved")} className="h-7 w-7 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center justify-center"><Check className="w-3.5 h-3.5" /></button>
                        <button data-testid={`reject-${w.id}`} onClick={() => process(w.id, "rejected")} className="h-7 w-7 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="withdrawals-pagination" />

      {viewing && isAdmin && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setViewing(null)} data-testid="withdrawal-modal">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Withdrawal</div>
                <div className="font-mono text-[#FFC83D] font-semibold">{viewing.ref_no || viewing.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <button onClick={() => setViewing(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Seller</span><span>{viewing.seller_username}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Amount</span><span className="font-semibold">${viewing.amount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Method</span><span className="uppercase">{viewing.method.replaceAll("_", " ")}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Status</span><span className="uppercase">{viewing.status}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Requested</span><span>{new Date(viewing.created_at).toLocaleString()}</span></div>
            </div>
            <div className="border-t border-zinc-800 pt-3">
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Payout details</div>
              <PayoutDetails method={viewing.method} details={viewing.payout_details} />
            </div>
            {viewing.admin_notes && (
              <div className="border-t border-zinc-800 pt-3">
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Admin notes</div>
                <div className="text-sm">{viewing.admin_notes}</div>
              </div>
            )}
            {viewing.status === "pending" && (
              <div className="flex gap-2 pt-2">
                <button data-testid={`modal-approve-${viewing.id}`} onClick={() => process(viewing.id, "approved")} className="flex-1 h-9 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-sm font-semibold flex items-center justify-center gap-1.5"><Check className="w-4 h-4" /> Approve</button>
                <button data-testid={`modal-reject-${viewing.id}`} onClick={() => process(viewing.id, "rejected")} className="flex-1 h-9 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-semibold flex items-center justify-center gap-1.5"><X className="w-4 h-4" /> Reject</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
