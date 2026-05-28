import { useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import NotificationPanel from "./NotificationPanel";

export default function Header() {
  const { user, refreshUser } = useAuth();
  const { unread, setOpen, open, wsConnected } = useNotifications();
  const [busy, setBusy] = useState(false);

  const isSeller = user?.role === "seller";
  const availability = user?.profile?.availability_status || "OFFLINE";

  const toggleAvailability = async () => {
    if (!isSeller || busy) return;
    const next = availability === "ONLINE" ? "OFFLINE" : "ONLINE";
    if (next === "OFFLINE" && !window.confirm("Going OFFLINE will pause new order notifications. Continue?")) return;
    setBusy(true);
    try {
      await api.patch("/seller/availability", { status: next });
      await refreshUser();
      toast.success(`You are now ${next}`);
    } catch (e) {
      toast.error("Failed to update availability");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header data-testid="app-header" className="sticky top-0 z-40 glass border-b border-zinc-800/80 h-16 flex items-center justify-end px-4 lg:px-6 gap-3">
        {isSeller && (
          <button
            data-testid="availability-toggle"
            onClick={toggleAvailability}
            disabled={busy}
            className={`flex items-center gap-2 h-9 px-3 rounded-md text-xs font-semibold uppercase tracking-wider border transition-colors ${
              availability === "ONLINE"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15"
                : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <span className={availability === "ONLINE" ? "dot-online" : "dot-offline"} />
            {availability}
          </button>
        )}

        <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-500 uppercase tracking-wider">
          <span className={wsConnected ? "dot-online" : "dot-offline"} />
          <span data-testid="ws-status">{wsConnected ? "Live" : "Offline"}</span>
        </div>

        <button
          data-testid="notification-bell"
          onClick={() => setOpen(!open)}
          className="relative h-9 w-9 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center transition-colors"
        >
          <Bell className="w-4 h-4 text-zinc-300" />
          {unread > 0 && (
            <span data-testid="unread-badge" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FFC83D] text-black text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </header>
      <NotificationPanel />
    </>
  );
}
