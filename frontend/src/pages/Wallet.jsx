import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Wallet as WalletIcon, ArrowDownToLine } from "lucide-react";

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [txns, setTxns] = useState([]);

  useEffect(() => {
    api.get("/wallet").then((r) => setWallet(r.data));
    api.get("/wallet/transactions").then((r) => setTxns(r.data));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Wallet</h1>
        <p className="text-sm text-zinc-500 mt-1">Earnings &amp; transaction history</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Balance</span>
            <WalletIcon className="w-5 h-5 text-[#FFC83D]" />
          </div>
          <div className="font-display text-4xl font-bold mb-3" data-testid="wallet-balance">${(wallet?.available_balance ?? 0).toFixed(2)}</div>
          <Link to="/wallet/withdraw" data-testid="withdraw-link" className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#FFC83D] text-black text-sm font-semibold hover:bg-[#E5B437]">
            <ArrowDownToLine className="w-4 h-4" /> Withdraw
          </Link>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">Pending sales</span>
          </div>
          <div className="font-display text-4xl font-bold mb-2" data-testid="wallet-pending">${(wallet?.pending_balance ?? 0).toFixed(2)}</div>
          <p className="text-xs text-zinc-500">Funds will be added to your balance when orders are completed.</p>
        </div>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 font-display font-semibold">Transaction history</div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-950">
            <tr className="text-zinc-500 text-xs uppercase tracking-wider">
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Change</th>
              <th className="text-left px-5 py-3">Type</th>
              <th className="text-left px-5 py-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-zinc-500">No transactions yet.</td></tr>
            ) : txns.map((t) => (
              <tr key={t.id} className="border-b border-zinc-800/60">
                <td className="px-5 py-3 text-zinc-400 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                <td className={`px-5 py-3 font-semibold ${t.amount >= 0 ? "text-emerald-400" : "text-red-400"}`}>{t.amount >= 0 ? "+" : ""}${t.amount.toFixed(2)}</td>
                <td className="px-5 py-3 text-zinc-400 text-xs uppercase tracking-wider">{t.type.replaceAll("_", " ")}</td>
                <td className="px-5 py-3 text-zinc-500">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
