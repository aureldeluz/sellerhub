import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { ArrowLeft, Send, Check, CheckCheck, AlertTriangle, XCircle, CircleCheckBig, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { on, sendWs, sellerStatuses } = useNotifications();
  const [order, setOrder] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(null);
  const [sending, setSending] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);

  const reload = useCallback(async () => {
    const { data } = await api.get(`/orders/${id}`);
    setOrder(data);
    const m = await api.get(`/chat/rooms/${id}/messages`);
    setMsgs(m.data.messages);
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    const off1 = on("chat_message", (m) => {
      if (m.order_id === id) setMsgs((arr) => [...arr, m]);
    });
    const off2 = on("typing", (t) => {
      if (t.order_id === id && t.user_id !== user?.id) {
        setTyping(t.username);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(null), 2000);
      }
    });
    return () => { off1(); off2(); };
  }, [id, user?.id, on]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/chat/rooms/${id}/messages`, { content: text.trim() });
      setText("");
    } finally { setSending(false); }
  };

  const onTyping = (v) => {
    setText(v);
    sendWs({ event: "typing", order_id: id });
  };

  const setStatus = async (status) => {
    await api.patch(`/orders/${id}/status`, { status });
    toast.success(`Status updated to ${status}`);
    reload();
  };
  const complete = async () => {
    if (!window.confirm("Mark this order as completed and release funds?")) return;
    await api.post(`/orders/${id}/complete`);
    toast.success("Order completed.");
    reload();
  };
  const cancel = async () => {
    if (!cancelReason.trim()) { toast.error("Provide a reason"); return; }
    try {
      await api.post(`/orders/${id}/cancel`, { reason: cancelReason });
      toast.success("Order cancelled.");
      setShowCancel(false); setCancelReason("");
      reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to cancel order");
    }
  };
  const dispute = async () => {
    if (!disputeReason.trim()) { toast.error("Provide a reason"); return; }
    try {
      await api.post(`/disputes`, { order_id: id, reason: disputeReason });
      toast.success("Dispute opened.");
      setShowDispute(false); setDisputeReason("");
      reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to open dispute");
    }
  };

  if (!order) return <div className="text-zinc-500">Loading...</div>;
  const isAdmin = user?.role === "admin";
  const sellerStatus = sellerStatuses[order.seller_id] || order.seller?.availability_status;

  return (
    <div className="space-y-6">
      <button data-testid="back-btn" onClick={() => nav(-1)} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1.5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Order</div>
            <div className="font-mono text-sm break-all mb-4">#{order.id}</div>
            <div className="aspect-video bg-zinc-800 rounded-md overflow-hidden mb-4">
              {order.listing?.images?.[0] ? (
                <img src={fileUrl(order.listing.images[0].storage_path)} alt="" className="w-full h-full object-cover" />
              ) : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">No image</div>}
            </div>
            <div className="font-display font-semibold mb-1">{order.listing?.title}</div>
            <div className="text-xs text-zinc-500 mb-3">{order.listing?.game_name} · {order.listing?.category}</div>
            <div className="flex items-center justify-between text-sm border-t border-zinc-800 pt-3 mt-3">
              <span className="text-zinc-500">Quantity</span><span>{order.quantity}</span>
            </div>
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-zinc-500">Unit price</span><span>${order.unit_price?.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-display font-semibold pt-2 border-t border-zinc-800 mt-2">
              <span>Total</span><span className="text-[#FFC83D]">${order.amount?.toFixed(2)}</span>
            </div>
            <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Status</span><StatusBadge status={order.status} /></div>
              <div className="flex justify-between items-center"><span className="text-zinc-500">Seller</span>
                <span className="flex items-center gap-1.5"><span className={sellerStatus === "ONLINE" ? "dot-online" : "dot-offline"} />{order.seller?.username}</span>
              </div>
              <div className="flex justify-between"><span className="text-zinc-500">Created</span><span className="text-xs">{new Date(order.created_at).toLocaleString()}</span></div>
            </div>

            {isAdmin && !["completed", "cancelled"].includes(order.status) && (
              <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button data-testid="status-waiting" onClick={() => setStatus("waiting_delivery")} className="h-9 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700">Waiting delivery</button>
                  <button data-testid="status-delivered" onClick={() => setStatus("delivered")} className="h-9 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700">Mark delivered</button>
                </div>
                <button data-testid="complete-btn" onClick={complete} className="w-full h-9 text-sm rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 flex items-center justify-center gap-1.5">
                  <CircleCheckBig className="w-4 h-4" /> Complete &amp; release funds
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button data-testid="cancel-btn" onClick={() => setShowCancel(true)} className="h-9 text-xs rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center gap-1"><XCircle className="w-3 h-3" /> Cancel</button>
                  <button data-testid="dispute-btn" onClick={() => setShowDispute(true)} className="h-9 text-xs rounded-md bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Dispute</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg flex flex-col h-[70vh]">
            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="font-display font-semibold">Live chat</div>
                <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <span className={sellerStatus === "ONLINE" ? "dot-online" : "dot-offline"} />
                  Counterparty {sellerStatus === "ONLINE" ? "online" : "offline"}
                </div>
              </div>
              {typing && <div className="text-xs text-zinc-500 italic">{typing} is typing…</div>}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgs.length === 0 ? (
                <div className="text-center text-zinc-600 text-sm py-12">Start the conversation 👋</div>
              ) : msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-lg px-3 py-2 ${mine ? "bg-[#FFC83D] text-black" : "bg-zinc-800 text-white"}`}>
                      {!mine && <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5">{m.sender_username}</div>}
                      <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={`text-[10px] mt-1 flex items-center gap-1 ${mine ? "text-black/60 justify-end" : "text-zinc-400"}`}>
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        {mine && (m.is_read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={send} className="px-4 py-3 border-t border-zinc-800 flex gap-2">
              <input data-testid="chat-input" value={text} onChange={(e) => onTyping(e.target.value)} placeholder="Type a message..."
                className="flex-1 h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
              <button data-testid="chat-send-btn" disabled={sending || !text.trim()} className="h-10 px-4 rounded-md bg-[#FFC83D] text-black font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
              </button>
            </form>
          </div>
        </div>
      </div>

      {showCancel && (
        <Modal title="Cancel order" onClose={() => setShowCancel(false)}>
          <textarea data-testid="cancel-reason-input" placeholder="Cancellation reason..." value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
            rows={4} className="w-full p-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm" />
          <button data-testid="confirm-cancel-btn" onClick={cancel} className="mt-3 h-10 px-4 rounded-md bg-red-500 hover:bg-red-600 text-white font-semibold">Confirm cancel</button>
        </Modal>
      )}
      {showDispute && (
        <Modal title="Open dispute" onClose={() => setShowDispute(false)}>
          <textarea data-testid="dispute-reason-input" placeholder="Dispute reason..." value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
            rows={4} className="w-full p-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm" />
          <button data-testid="confirm-dispute-btn" onClick={dispute} className="mt-3 h-10 px-4 rounded-md bg-orange-500 hover:bg-orange-600 text-black font-semibold">Open dispute</button>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display font-semibold text-lg">{title}</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    active: "bg-[#FFC83D]/20 text-[#FFC83D]", pending: "bg-zinc-700 text-zinc-300",
    waiting_delivery: "bg-blue-500/20 text-blue-300", delivered: "bg-teal-500/20 text-teal-300",
    completed: "bg-emerald-500/20 text-emerald-300", cancelled: "bg-red-500/20 text-red-300",
    disputed: "bg-orange-500/20 text-orange-300",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${map[status] || "bg-zinc-700"}`}>{status}</span>;
}
