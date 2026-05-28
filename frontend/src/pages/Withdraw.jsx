import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft, Wallet as WalletIcon, Building2, CircleDollarSign, Send } from "lucide-react";
import { toast } from "sonner";

const METHODS = [
  { key: "e_wallet", label: "E-Wallet", icon: WalletIcon },
  { key: "bank_transfer", label: "Bank Transfer", icon: Building2 },
  { key: "solana", label: "Solana", icon: CircleDollarSign },
];

const EWALLET_PROVIDERS = [
  { value: "dana", label: "Dana" },
  { value: "gopay", label: "Gopay" },
  { value: "shopeepay", label: "ShopeePay" },
  { value: "ovo", label: "Ovo" },
];

export default function Withdraw() {
  const nav = useNavigate();
  const [method, setMethod] = useState("e_wallet");
  const [amount, setAmount] = useState(0);
  const [wallet, setWallet] = useState(null);
  const [busy, setBusy] = useState(false);

  // method-specific fields
  const [provider, setProvider] = useState("dana");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [solanaAddress, setSolanaAddress] = useState("");

  useEffect(() => { api.get("/wallet").then((r) => setWallet(r.data)); }, []);

  const buildDetails = () => {
    if (method === "e_wallet") return { provider, account_number: accountNumber };
    if (method === "bank_transfer") return { bank_name: bankName, account_holder: accountHolder, account_number: accountNumber };
    if (method === "solana") return { solana_address: solanaAddress };
    return {};
  };

  const submit = async (e) => {
    e.preventDefault();
    if (parseFloat(amount) < 10) { toast.error("Minimum withdrawal: $10"); return; }
    setBusy(true);
    try {
      const r = await api.post("/wallet/withdraw", {
        amount: parseFloat(amount),
        method,
        payout_details: buildDetails(),
      });
      toast.success(`Withdrawal submitted: ${r.data.ref_no}`);
      nav("/wallet");
    } catch (e) { toast.error(e.response?.data?.detail?.[0]?.msg || e.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button onClick={() => nav(-1)} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1.5" data-testid="back-to-wallet">
        <ArrowLeft className="w-4 h-4" /> Back to wallet
      </button>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Withdraw</h1>
      <p className="text-sm text-zinc-500">Available balance: <span className="text-white font-semibold" data-testid="withdraw-available-balance">${(wallet?.available_balance ?? 0).toFixed(2)}</span></p>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-3">Select method</label>
          <div className="grid grid-cols-3 gap-3">
            {METHODS.map((m) => (
              <button type="button" key={m.key} data-testid={`method-${m.key}`} onClick={() => setMethod(m.key)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border ${method === m.key ? "border-[#FFC83D] bg-[#FFC83D]/5" : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"}`}>
                <m.icon className={`w-5 h-5 ${method === m.key ? "text-[#FFC83D]" : "text-zinc-400"}`} />
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
          <div className="space-y-4">
            {method === "e_wallet" && (
              <>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">E-Wallet provider</label>
                  <select data-testid="ewallet-provider" value={provider} onChange={(e) => setProvider(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60">
                    {EWALLET_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Account number</label>
                  <input data-testid="ewallet-account-number" required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
                </div>
              </>
            )}
            {method === "bank_transfer" && (
              <>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Bank name</label>
                  <input data-testid="bank-name" required value={bankName} onChange={(e) => setBankName(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Account holder name</label>
                  <input data-testid="bank-account-holder" required value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Account number</label>
                  <input data-testid="bank-account-number" required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
                </div>
              </>
            )}
            {method === "solana" && (
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Solana address</label>
                <input data-testid="solana-address" required value={solanaAddress} onChange={(e) => setSolanaAddress(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Withdrawal amount (USD)</label>
              <input data-testid="amount-input" required type="number" step="0.01" min="10" max={wallet?.available_balance ?? 0} value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1">Exchange rate</div>
            <div className="flex justify-between p-3 rounded-md bg-zinc-950 border border-zinc-800" data-testid="rate-monday">
              <span className="text-zinc-400">Rate setiap Senin</span>
              <span className="text-[#FFC83D] font-semibold">Rp.13,300</span>
            </div>
            <div className="flex justify-between p-3 rounded-md bg-zinc-950 border border-zinc-800" data-testid="rate-other">
              <span className="text-zinc-400">Rate hari lain</span>
              <span className="text-[#FFC83D] font-semibold">Rp.13,000</span>
            </div>
            <p className="text-xs text-zinc-500 pt-2">Min withdrawal $10. Admin approval required.</p>
          </div>
        </div>

        <button data-testid="submit-withdraw-btn" type="submit" disabled={busy} className="h-10 px-6 rounded-md bg-[#FFC83D] text-black font-semibold hover:bg-[#E5B437] flex items-center gap-2 disabled:opacity-50">
          <Send className="w-4 h-4" /> Submit
        </button>
      </form>
    </div>
  );
}
