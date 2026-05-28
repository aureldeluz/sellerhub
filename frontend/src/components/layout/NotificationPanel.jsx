import { AnimatePresence, motion } from "framer-motion";
import { X, Bell, Check } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { formatDistanceToNow } from "date-fns";

export default function NotificationPanel() {
  const { open, setOpen, items, unread, markAllRead, markRead } = useNotifications();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.aside
            data-testid="notification-panel"
            initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-full sm:w-96 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col"
          >
            <div className="h-16 px-5 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FFC83D]" />
                <span className="font-display font-semibold text-lg">Notifications</span>
                {unread > 0 && (
                  <span className="text-[10px] bg-[#FFC83D] text-black px-1.5 rounded font-bold">{unread}</span>
                )}
              </div>
              <button data-testid="close-notif-panel" onClick={() => setOpen(false)} className="w-8 h-8 rounded-md hover:bg-zinc-900 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-xs text-zinc-500">{items.length} recent</span>
              {unread > 0 && (
                <button data-testid="mark-all-read-btn" onClick={markAllRead} className="text-xs text-[#FFC83D] hover:underline flex items-center gap-1">
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-5 py-12 text-center text-zinc-500 text-sm">
                  No notifications yet.
                </div>
              ) : items.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  data-testid={`notif-item-${n.id}`}
                  className={`px-5 py-4 border-b border-zinc-900 hover:bg-zinc-900/60 cursor-pointer ${!n.is_read ? "bg-zinc-900/40 border-l-2 border-l-[#FFC83D]" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${!n.is_read ? "bg-[#FFC83D]/10 text-[#FFC83D]" : "bg-zinc-900 text-zinc-500"}`}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{n.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-zinc-600 mt-1.5 uppercase tracking-wider">
                        {n.created_at && formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
