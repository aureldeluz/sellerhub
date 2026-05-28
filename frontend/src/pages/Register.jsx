import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Gamepad2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(form.username, form.email, form.password);
      toast.success("Account created! Welcome.");
      nav("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-md bg-[#FFC83D] flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-black" />
          </div>
          <div className="font-display font-bold text-2xl tracking-tight">SellerHub</div>
        </div>
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-8">
          <h1 className="font-display text-2xl font-semibold mb-1">Create seller account</h1>
          <p className="text-sm text-zinc-500 mb-6">Join the fulfillment network.</p>
          <form onSubmit={submit} className="space-y-4">
            {[
              { k: "username", label: "Username", type: "text" },
              { k: "email", label: "Email", type: "email" },
              { k: "password", label: "Password (min 6)", type: "password" },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">{f.label}</label>
                <input
                  data-testid={`register-${f.k}-input`}
                  required type={f.type} value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                  className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 focus:border-[#FFC83D]/60 focus:ring-2 focus:ring-[#FFC83D]/20 outline-none text-sm"
                />
              </div>
            ))}
            <button
              data-testid="register-submit-btn" type="submit" disabled={busy}
              className="w-full h-10 rounded-md bg-[#FFC83D] text-black font-semibold hover:bg-[#E5B437] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create account
            </button>
          </form>
          <div className="mt-6 text-sm text-zinc-500 text-center">
            Already have an account?{" "}
            <Link data-testid="goto-login" to="/login" className="text-[#FFC83D] hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
