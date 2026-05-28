import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { api, WS_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const NotifCtx = createContext(null);
export const useNotifications = () => useContext(NotifCtx);

// Tiny notification "beep" generator (WebAudio) - no asset required
function playBeep(volume = 0.7, freq = 880, duration = 0.16) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = volume * 0.25;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), duration * 1000 + 100);
  } catch {}
}

const SOUND_FREQ = {
  new_order: 660,
  new_message: 880,
  dispute_opened: 440,
  dispute_resolved: 520,
  withdrawal_requested: 740,
  withdrawal_approved: 800,
  withdrawal_rejected: 380,
  order_completed: 700,
  order_cancelled: 380,
  seller_status_changed: 540,
  listing_created: 600,
  listing_updated: 580,
  seller_registered: 620,
  rating_changed: 660,
  default: 720,
};

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [prefs, setPrefs] = useState({ sound_enabled: true, sound_volume: 0.7, muted_categories: [] });
  const [open, setOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [sellerStatuses, setSellerStatuses] = useState({}); // seller_id -> ONLINE/OFFLINE
  const wsRef = useRef(null);
  const lastSoundRef = useRef(0);
  const eventBusRef = useRef(new Map()); // event -> Set<handler>

  // Pub/Sub bus
  const on = useCallback((event, handler) => {
    const map = eventBusRef.current;
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(handler);
    return () => map.get(event)?.delete(handler);
  }, []);
  const emit = useCallback((event, payload) => {
    const set = eventBusRef.current.get(event);
    if (set) set.forEach((h) => { try { h(payload); } catch {} });
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 30 } });
      setItems(data);
      const c = await api.get("/notifications/unread-count");
      setUnread(c.data.count);
    } catch {}
  }, []);

  const fetchPrefs = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/preferences");
      setPrefs(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    fetchPrefs();
  }, [user, fetchNotifications, fetchPrefs]);

  // WebSocket connection
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        if (event === "notification") handleIncoming(data);
        if (event === "seller_status_change") {
          setSellerStatuses((s) => ({ ...s, [data.seller_id]: data.new }));
          emit("seller_status_change", data);
        }
        if (event === "online_sellers") {
          const map = {};
          (data || []).forEach((sp) => { map[sp.user_id] = sp.availability_status; });
          setSellerStatuses(map);
        }
        if (event === "chat_message") emit("chat_message", data);
        if (event === "typing") emit("typing", data);
        if (event === "new_order") emit("new_order", data);
        if (event === "seller_activity") emit("seller_activity", data);
      } catch (err) { console.error(err); }
    };
    const ping = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ event: "ping" }));
    }, 25000);
    return () => { clearInterval(ping); try { ws.close(); } catch {} };
    // eslint-disable-next-line
  }, [user]);

  function handleIncoming(notif) {
    setItems((arr) => [notif, ...arr].slice(0, 30));
    setUnread((c) => c + 1);
    const muted = (prefs.muted_categories || []).includes(notif.type);
    if (!muted) {
      toast(notif.title, { description: notif.message });
      // sound debounce: max once per 800ms
      if (prefs.sound_enabled && Date.now() - lastSoundRef.current > 800) {
        lastSoundRef.current = Date.now();
        playBeep(prefs.sound_volume ?? 0.7, SOUND_FREQ[notif.type] || SOUND_FREQ.default);
      }
    }
    emit("notification", notif);
  }

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((c) => Math.max(0, c - 1));
  };
  const markAllRead = async () => {
    await api.post("/notifications/read-all");
    setItems((arr) => arr.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
  };
  const updatePrefs = async (patch) => {
    const { data } = await api.patch("/notifications/preferences", patch);
    setPrefs(data);
  };

  const sendWs = (payload) => {
    try { wsRef.current?.send(JSON.stringify(payload)); } catch {}
  };

  return (
    <NotifCtx.Provider value={{
      items, unread, prefs, open, setOpen, wsConnected,
      sellerStatuses, markRead, markAllRead, updatePrefs,
      on, emit, sendWs, refresh: fetchNotifications,
    }}>
      {children}
    </NotifCtx.Provider>
  );
}
