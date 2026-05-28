import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useNotifications } from "@/context/NotificationContext";
import { formatDistanceToNow } from "date-fns";

export default function Messages() {
  const [rooms, setRooms] = useState([]);
  const { on } = useNotifications();
  const fetch = async () => {
    const { data } = await api.get("/chat/rooms");
    setRooms(data);
  };
  useEffect(() => {
    fetch();
    const off = on("chat_message", fetch);
    return () => off();
  }, [on]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-zinc-500 mt-1">All order chats</p>
      </div>
      {rooms.length === 0 ? (
        <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-lg p-12 text-center text-zinc-500 text-sm">
          No conversations yet.
        </div>
      ) : (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {rooms.map((r) => (
            <Link key={r.id} data-testid={`room-${r.id}`} to={`/orders/${r.order_id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-900/80">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFC83D]/40 to-amber-700/40 flex items-center justify-center font-display font-bold text-sm">
                {r.order?.seller?.username?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="font-medium truncate">{r.order?.listing?.title || "Order"}</div>
                  {r.last_message && <span className="text-xs text-zinc-500">{formatDistanceToNow(new Date(r.last_message.created_at), { addSuffix: true })}</span>}
                </div>
                <div className="text-sm text-zinc-500 truncate">
                  {r.last_message ? `${r.last_message.sender_username || "—"}: ${r.last_message.content}` : "No messages yet"}
                </div>
              </div>
              {r.unread > 0 && <span className="bg-[#FFC83D] text-black text-xs font-bold rounded-full px-2 py-0.5">{r.unread}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
