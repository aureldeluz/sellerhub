import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Plus, Pencil, Trash2, ShoppingCart, Search } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/Pagination";

const STATUSES = ["all", "pending", "active", "paused", "sold", "archived"];
const LIMIT = 15;

export default function Listings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");

  const fetch = async () => {
    const params = { skip, limit: LIMIT };
    if (statusFilter !== "all") params.status = statusFilter;
    if (q) params.q = q;
    const r = await api.get("/listings", { params });
    setItems(r.data);
    setTotal(parseInt(r.headers["x-total-count"] || r.data.length));
  };
  useEffect(() => { fetch(); /* eslint-disable-next-line */ }, [statusFilter, skip]);
  useEffect(() => { setSkip(0); }, [statusFilter, q]);

  const checkout = async (listingId) => {
    try {
      await api.post("/orders/checkout", { listing_id: listingId, quantity: 1 });
      toast.success("Order created. Chat opened with seller.");
      fetch();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const archive = async (id) => {
    if (!window.confirm("Archive this listing?")) return;
    await api.delete(`/listings/${id}`);
    toast.success("Archived");
    fetch();
  };

  const hardDelete = async (id) => {
    if (!window.confirm("Permanently delete this archived listing? This cannot be undone.")) return;
    await api.delete(`/listings/${id}`);
    toast.success("Listing deleted permanently");
    fetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">{isAdmin ? "All Listings" : "My Listings"}</h1>
          <p className="text-sm text-zinc-500 mt-1">{total} item{total !== 1 && "s"}</p>
        </div>
        {!isAdmin && (
          <Link data-testid="new-listing-btn" to="/listings/new" className="h-10 px-4 rounded-md bg-[#FFC83D] text-black font-semibold flex items-center gap-2 hover:bg-[#E5B437]">
            <Plus className="w-4 h-4" /> New Listing
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {STATUSES.map((s) => (
          <button
            key={s} data-testid={`filter-${s}`} onClick={() => setStatusFilter(s)}
            className={`h-8 px-3 text-xs uppercase tracking-wider rounded-md border ${statusFilter === s ? "bg-[#FFC83D] text-black border-[#FFC83D]" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"}`}
          >{s}</button>
        ))}
        <div className="flex-1 max-w-xs ml-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            data-testid="listings-search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetch()}
            placeholder="Search listings..." className="w-full h-9 bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 text-sm outline-none focus:border-[#FFC83D]/60"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-lg p-12 text-center">
          <p className="text-zinc-500 text-sm">No listings found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((l) => (
            <div key={l.id} data-testid={`listing-card-${l.id}`} className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden card-hover">
              <div className="aspect-video bg-zinc-800/60 relative">
                {l.images?.[0] ? (
                  <img src={fileUrl(l.images[0].storage_path)} alt={l.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs uppercase tracking-wider">No image</div>
                )}
                <div className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                  l.status === "active" ? "bg-emerald-500/20 text-emerald-300" :
                  l.status === "pending" ? "bg-[#FFC83D]/20 text-[#FFC83D]" :
                  l.status === "paused" ? "bg-zinc-700 text-zinc-300" :
                  l.status === "sold" ? "bg-blue-500/20 text-blue-300" : "bg-red-500/20 text-red-300"
                }`}>{l.status}</div>
              </div>
              <div className="p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{l.game_name} · {l.category}</div>
                <div className="font-display font-semibold text-base mb-2 line-clamp-1">{l.title}</div>
                {isAdmin && l.seller && (
                  <div className="text-xs text-zinc-500 flex items-center gap-2 mb-2">
                    <span className={l.seller.availability_status === "ONLINE" ? "dot-online" : "dot-offline"} />
                    {l.seller.username}
                  </div>
                )}
                <div className="flex items-end justify-between">
                  <div>
                    <div className="font-display text-xl font-bold">${l.price.toFixed(2)}</div>
                    <div className="text-xs text-zinc-500">Stock: {l.stock}</div>
                  </div>
                  <div className="flex gap-1">
                    {isAdmin && l.status !== "sold" && l.status !== "archived" && (
                      <button data-testid={`checkout-${l.id}`} onClick={() => checkout(l.id)} className="h-8 px-3 rounded-md bg-[#FFC83D] text-black text-xs font-semibold flex items-center gap-1 hover:bg-[#E5B437]">
                        <ShoppingCart className="w-3 h-3" /> Checkout
                      </button>
                    )}
                    <Link data-testid={`edit-${l.id}`} to={`/listings/${l.id}/edit`} className="h-8 w-8 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center">
                      <Pencil className="w-3 h-3" />
                    </Link>
                    {isAdmin && l.status === "archived" ? (
                      <button data-testid={`hard-del-${l.id}`} onClick={() => hardDelete(l.id)} className="h-8 w-8 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center" title="Delete permanently">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    ) : (
                      <button data-testid={`del-${l.id}`} onClick={() => archive(l.id)} className="h-8 w-8 rounded-md bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination skip={skip} limit={LIMIT} total={total} onChange={setSkip} testid="listings-pagination" />
    </div>
  );
}
