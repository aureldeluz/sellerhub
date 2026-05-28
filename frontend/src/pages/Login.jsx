import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Gamepad2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function Login() {
  const { refreshUser } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { email, password };
      if (need2fa) body.totp_code = totp;
      const { data } = await api.post("/auth/login", body);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      await refreshUser();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.code === "2fa_required") {
        setNeed2fa(true);
        toast.info("Enter your 6-digit authenticator code.");
        setBusy(false);
        return;
      }
      if (detail && typeof detail === "object" && detail.code === "2fa_invalid") {
        toast.error("Invalid 2FA code.");
        setBusy(false);
        return;
      }
      toast.error(typeof detail === "string" ? detail : "Login failed");
      setBusy(false);
      return;
    }
    nav("/dashboard");
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(255,200,61,0.10),transparent_40%),radial-gradient(circle_at_90%_80%,rgba(255,200,61,0.06),transparent_40%)]" />
      <div className="relative w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-md bg-[#FFC83D] flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-black" />
          </div>
          <div className="font-display font-bold text-2xl tracking-tight">SellerHub</div>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-8 backdrop-blur-xl">
          <h1 className="font-display text-2xl font-semibold mb-1">{need2fa ? "Two-factor required" : "Sign in"}</h1>
          <p className="text-sm text-zinc-500 mb-6">{need2fa ? "Enter the 6-digit code from your authenticator app." : "Internal seller management console."}</p>
          <form onSubmit={submit} className="space-y-4">
            {!need2fa && (
              <>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Email</label>
                  <input
                    data-testid="login-email-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 focus:border-[#FFC83D]/60 focus:ring-2 focus:ring-[#FFC83D]/20 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">Password</label>
                  <input
                    data-testid="login-password-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 focus:border-[#FFC83D]/60 focus:ring-2 focus:ring-[#FFC83D]/20 outline-none text-sm"
                  />
                </div>
              </>
            )}
            {need2fa && (
              <div>
                <label className="text-xs uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#FFC83D]" /> Authenticator code
                </label>
                <input
                  data-testid="login-totp-input" autoFocus required inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full h-12 px-3 rounded-md bg-zinc-950 border border-zinc-800 focus:border-[#FFC83D]/60 outline-none text-2xl tracking-[0.4em] text-center font-mono"
                />
              </div>
            )}
            <button
              data-testid="login-submit-btn" type="submit" disabled={busy}
              className="w-full h-10 rounded-md bg-[#FFC83D] text-black font-semibold hover:bg-[#E5B437] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {need2fa ? "Verify & sign in" : "Sign in"}
            </button>
            {need2fa && (
              <button type="button" onClick={() => { setNeed2fa(false); setTotp(""); }} className="w-full text-xs text-zinc-500 hover:text-white">
                ← Back to credentials
              </button>
            )}
          </form>
          {!need2fa && (
            <div className="mt-6 text-sm text-zinc-500 flex items-center justify-between">
              <Link data-testid="goto-register" to="/register" className="hover:text-white">Create seller account</Link>
              <Link data-testid="goto-forgot" to="/forgot-password" className="hover:text-white">Forgot password?</Link>
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-600 text-center mt-6">Admin seed: admin@sellerhub.io / Admin@12345</p>
      </div>
    </div>
  );
}
