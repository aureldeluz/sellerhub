import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, Loader2, GripVertical } from "lucide-react";

const CATEGORIES = ["Account", "Currency", "Item", "Boosting", "Gift Card", "Top Up"];
const STATUS_OPTIONS = ["active", "paused"];

export default function ListingForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const nav = useNavigate();
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    title: "", game_name: "", category: "Item",
    description: "", stock: 1, price: 0, status: "active",
  });
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.get(`/listings/${id}`).then(({ data }) => {
        setForm({
          title: data.title, game_name: data.game_name, category: data.category,
          description: data.description, stock: data.stock, price: data.price, status: data.status,
        });
        setImages(data.images || []);
      });
    }
  }, [id, isEdit]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isEdit) {
        await api.patch(`/listings/${id}`, { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) });
        toast.success("Listing updated");
      } else {
        const { data } = await api.post("/listings", { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) });
        toast.success("Listing created");
        nav(`/listings/${data.id}/edit`);
        return;
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    } finally { setBusy(false); }
  };

  const uploadFiles = async (files) => {
    const remaining = 3 - images.length;
    const arr = Array.from(files).slice(0, remaining);
    if (!isEdit) {
      toast.error("Create listing first, then add images.");
      return;
    }
    setUploading(true);
    for (const f of arr) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        toast.error(`${f.name}: invalid format`); continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name}: max 10MB`); continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await api.post(`/listings/${id}/images`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        setImages((s) => [...s, data]);
      } catch (e) {
        toast.error(e.response?.data?.detail || "Upload failed");
      }
    }
    setUploading(false);
  };

  const removeImg = async (imgId) => {
    await api.delete(`/listings/${id}/images/${imgId}`);
    setImages((s) => s.filter((i) => i.id !== imgId));
  };

  // Drag-to-reorder
  const [dragIdx, setDragIdx] = useState(null);

  const onDragStart = (idx) => setDragIdx(idx);
  const onDragOver = (e) => e.preventDefault();
  const onDropImg = async (e, targetIdx) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const next = [...images];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    const reordered = next.map((img, i) => ({ ...img, image_order: i }));
    setImages(reordered);
    setDragIdx(null);
    try {
      await api.patch(`/listings/${id}/images/reorder`, { image_ids: reordered.map((i) => i.id) });
      toast.success("Order saved");
    } catch (e) {
      toast.error("Failed to reorder");
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button data-testid="back-btn" onClick={() => nav(-1)} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1.5">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">{isEdit ? "Edit listing" : "New listing"}</h1>

      <form onSubmit={save} className="space-y-5">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5 space-y-4">
          <Field label="Title (max 160)" required>
            <input data-testid="listing-title-input" required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Game" required>
              <input data-testid="listing-game-input" required value={form.game_name} onChange={(e) => setForm({ ...form, game_name: e.target.value })}
                className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
            </Field>
            <Field label="Category" required>
              <select data-testid="listing-category-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Price USD" required>
              <input data-testid="listing-price-input" required type="number" step="0.01" min="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
            </Field>
            <Field label="Stock" required>
              <input data-testid="listing-stock-input" required type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm" />
            </Field>
            <Field label="Status" required>
              <select data-testid="listing-status-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm">
                {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description (max 2000)" required>
            <textarea data-testid="listing-desc-input" required maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4} className="w-full p-3 rounded-md bg-zinc-950 border border-zinc-800 outline-none text-sm focus:border-[#FFC83D]/60" />
          </Field>
        </div>

        {isEdit && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-display font-semibold">Image gallery</div>
                <div className="text-xs text-zinc-500">{images.length}/3 · JPG, PNG, WEBP · max 10MB · drag tiles to reorder</div>
              </div>
              <button type="button" data-testid="upload-img-btn" onClick={() => fileRef.current?.click()} disabled={images.length >= 3 || uploading}
                className="h-9 px-3 rounded-md bg-[#FFC83D] text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
              </button>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); uploadFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-md ${drag ? "border-[#FFC83D]" : "border-zinc-800"} bg-zinc-950 p-4 mb-4`}
            >
              {images.length === 0 ? (
                <div className="text-center text-zinc-500 text-sm py-6">Drag &amp; drop images here, or click Upload above</div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      data-testid={`listing-img-${img.id}`}
                      draggable
                      onDragStart={() => onDragStart(idx)}
                      onDragOver={onDragOver}
                      onDrop={(e) => onDropImg(e, idx)}
                      className={`relative aspect-square rounded-md overflow-hidden bg-zinc-800 group cursor-move ring-offset-2 ring-offset-zinc-950 ${dragIdx === idx ? "ring-2 ring-[#FFC83D] opacity-60" : ""}`}
                    >
                      <img src={fileUrl(img.storage_path)} alt="" className="w-full h-full object-cover pointer-events-none" />
                      <button type="button" data-testid={`del-img-${img.id}`} onClick={() => removeImg(img.id)} className="absolute top-1 right-1 h-7 w-7 bg-black/60 hover:bg-red-500 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-1 left-1 text-[10px] bg-black/70 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 text-white">
                        <GripVertical className="w-3 h-3" /> #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button data-testid="save-listing-btn" type="submit" disabled={busy} className="h-10 px-6 rounded-md bg-[#FFC83D] text-black font-semibold hover:bg-[#E5B437] disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {isEdit ? "Save changes" : "Create listing"}
          </button>
          <button type="button" onClick={() => nav(-1)} className="h-10 px-6 rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-zinc-400 block mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
