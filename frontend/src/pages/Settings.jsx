import { useNotifications } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";
import { Volume2, BellOff, Save, ShieldCheck, ShieldOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const CATEGORIES = [
  { key: "new_order", label: "New orders" },
  { key: "new_message", label: "Chat messages" },
  { key: "order_completed", label: "Order completions" },
  { key: "order_cancelled", label: "Order cancellations" },
  { key: "dispute_opened", label: "Disputes opened" },
  { key: "dispute_resolved", label: "Disputes resolved" },
  { key: "withdrawal_requested", label: "Withdrawal requests" },
  { key: "withdrawal_approved", label: "Withdrawal approvals" },
  { key: "withdrawal_rejected", label: "Withdrawal rejections" },
  { key: "seller_status_changed", label: "Seller status changes" },
  { key: "listing_created", label: "Listing created" },
  { key: "listing_updated", label: "Listing updated" },
  { key: "rating_changed", label: "Rating changes" },
];

function playBeep(volume = 0.7) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 720;
    gain.gain.value = volume * 0.25;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.stop(ctx.currentTime + 0.18);
    setTimeout(() => ctx.close(), 250);
  } catch {}
}

function TwoFactorSection() {
  const { user, refreshUser } = useAuth();
  const enabled = !!user?.totp_enabled;
  const [setup, setSetup] = useState(null); // { secret, otpauth_uri }
  const [pwd, setPwd] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/2fa/setup");
      setSetup(data);
    } catch { toast.error("Failed to start 2FA setup"); }
    finally { setBusy(false); }
  };

  const enable = async () => {
    if (!pwd || !code) { toast.error("Password and code required"); return; }
    setBusy(true);
    try {
      await api.post("/auth/2fa/enable", { password: pwd, code });
      toast.success("Two-factor authentication enabled");
      setSetup(null); setPwd(""); setCode("");
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const disable = async () => {
    if (!pwd || !code) { toast.error("Password and code required"); return; }
    setBusy(true);
    try {
      await api.post("/auth/2fa/disable", { password: pwd, code });
      toast.success("Two-factor authentication disabled");
      setPwd(""); setCode("");
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const qrUrl = setup ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.otpauth_uri)}` : null;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display font-semibold flex items-center gap-2">
            {enabled ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldOff className="w-4 h-4 text-zinc-500" />}
            Two-factor authentication
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Add a 6-digit TOTP code (Google Authenticator, 1Password, Authy).</p>
        </div>
        <span data-testid="2fa-status" className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-300"}`}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {!enabled && !setup && (
        <button data-testid="2fa-setup-btn" onClick={startSetup} disabled={busy} className="h-9 px-3 text-sm rounded-md bg-[#FFC83D] text-black font-semibold hover:bg-[#E5B437] flex items-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          <KeyRound className="w-4 h-4" /> Start setup
        </button>
      )}

      {!enabled && setup && (
        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <p className="text-sm text-zinc-300">1. Scan the QR with your authenticator app, or use the secret key.</p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <img src={qrUrl} alt="2FA QR" className="bg-white rounded-md w-44 h-44" data-testid="2fa-qr" />
            <div className="space-y-2 flex-1">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Manual secret</div>
              <div data-testid="2fa-secret" className="font-mono text-sm break-all bg-zinc-950 border border-zinc-800 rounded-md p-2 select-all">{setup.secret}</div>
              <button onClick={() => { navigator.clipboard?.writeText(setup.secret); toast.success("Secret copied"); }} className="text-xs text-[#FFC83D] hover:underline">Copy secret</button>
            </div>
          </div>
          <p className="text-sm text-zinc-300">2. Confirm with your password &amp; a fresh 6-digit code.</p>
          <input data-testid="2fa-password" type="password" placeholder="Current password" value={pwd} onChange={(e) => setPwd(e.target.value)}
            className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm" />
          <input data-testid="2fa-enable-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm font-mono tracking-widest text-center" />
          <div className="flex gap-2">
            <button data-testid="2fa-enable-btn" onClick={enable} disabled={busy} className="h-9 px-3 text-sm rounded-md bg-emerald-500 text-black font-semibold hover:bg-emerald-400 flex items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enable 2FA
            </button>
            <button onClick={() => { setSetup(null); setPwd(""); setCode(""); }} className="h-9 px-3 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700">Cancel</button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <p className="text-sm text-zinc-300">To disable 2FA, confirm your password and a current 6-digit code.</p>
          <input data-testid="2fa-disable-password" type="password" placeholder="Current password" value={pwd} onChange={(e) => setPwd(e.target.value)}
            className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm" />
          <input data-testid="2fa-disable-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm font-mono tracking-widest text-center" />
          <button data-testid="2fa-disable-btn" onClick={disable} disabled={busy} className="h-9 px-3 text-sm rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} <ShieldOff className="w-4 h-4" /> Disable 2FA
          </button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { prefs, updatePrefs } = useNotifications();
  const [local, setLocal] = useState({ sound_enabled: true, sound_volume: 0.7, muted_categories: [] });

  useEffect(() => {
    if (prefs) setLocal({
      sound_enabled: prefs.sound_enabled ?? true,
      sound_volume: prefs.sound_volume ?? 0.7,
      muted_categories: prefs.muted_categories ?? [],
    });
  }, [prefs]);

  const toggleMute = (key) => {
    setLocal((s) => ({ ...s, muted_categories: s.muted_categories.includes(key) ? s.muted_categories.filter((c) => c !== key) : [...s.muted_categories, key] }));
  };

  const save = async () => {
    await updatePrefs(local);
    toast.success("Preferences saved");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Account security & notification preferences</p>
      </div>

      <TwoFactorSection />

      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display font-semibold">Sound notifications</div>
            <p className="text-xs text-zinc-500">Play a beep when a notification arrives.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input data-testid="sound-toggle" type="checkbox" checked={local.sound_enabled} onChange={(e) => setLocal({ ...local, sound_enabled: e.target.checked })} className="sr-only peer" />
            <div className="w-11 h-6 bg-zinc-800 rounded-full peer-checked:bg-[#FFC83D] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:w-5 after:h-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:bg-black"></div>
          </label>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-zinc-400" />
              <span className="text-sm">Volume</span>
            </div>
            <button data-testid="test-sound-btn" onClick={() => playBeep(local.sound_volume)} className="text-xs text-[#FFC83D] hover:underline">Test sound</button>
          </div>
          <input data-testid="volume-slider" type="range" min="0" max="1" step="0.05" value={local.sound_volume}
            onChange={(e) => setLocal({ ...local, sound_volume: parseFloat(e.target.value) })}
            className="w-full accent-[#FFC83D]" />
          <div className="text-xs text-zinc-500 mt-1">{Math.round(local.sound_volume * 100)}%</div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <BellOff className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium">Mute categories</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input data-testid={`mute-${c.key}`} type="checkbox" checked={local.muted_categories.includes(c.key)} onChange={() => toggleMute(c.key)}
                  className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 accent-[#FFC83D]" />
                <span className="text-zinc-300">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button data-testid="save-prefs-btn" onClick={save} className="h-10 px-4 rounded-md bg-[#FFC83D] text-black font-semibold hover:bg-[#E5B437] flex items-center gap-2">
          <Save className="w-4 h-4" /> Save preferences
        </button>
      </div>
    </div>
  );
}
