/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 * Includes on-device background removal for saved photos.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Trash2, Save, ChevronDown, Loader2, Check, Wand2 } from "lucide-react";
import type { ClothingItem, ClothingItemUpdateCategory } from "@/types/local";
import { useUpdateClothingItem, useDeleteClothingItem, getListClothingQueryKey } from "@/hooks/useLocalWardrobe";
import { getListOutfitsQueryKey } from "@/hooks/useLocalOutfits";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import { removeBackground, blobToDataUrl, dataUrlToBlob } from "@/lib/backgroundRemoval";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS   = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS = ["rings", "earrings", "necklaces", "bracelets"];

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                   bg-white focus:outline-none focus:ring-2 focus:ring-primary
                   placeholder:font-normal placeholder:text-black/25"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border-2 border-black rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
        >
          {options.map((o) => (
            <option key={o} value={o}>{o || `— ${label} —`}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")
  );
}

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form, setForm]                         = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Background removal state ───────────────────────────────────────────────
  type BgPhase = "idle" | "processing" | "preview" | "failed";
  const [bgPhase,     setBgPhase]     = useState<BgPhase>("idle");
  const [cleanedUrl,  setCleanedUrl]  = useState<string | null>(null);
  const [cleanedBlob, setCleanedBlob] = useState<Blob | null>(null);
  const [bgSelected,  setBgSelected]  = useState<"original" | "cleaned">("cleaned");
  const bgGenRef = useRef(0);

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
    // Reset bg removal when item changes
    setBgPhase("idle");
    setCleanedUrl(null);
    setCleanedBlob(null);
    setBgSelected("cleaned");
    bgGenRef.current += 1;
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !form) return null;

  const dirty = isDirty(form, item);
  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
  };

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim() || null,
          color:         form.color.trim() || null,
          size:          form.size.trim() || null,
          season:        form.season || null,
          occasion:      form.occasion || null,
          purchasePrice: form.purchasePrice.trim() || null,
          purchaseDate:  form.purchaseDate.trim() || null,
          notes:         form.notes.trim() || null,
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
        },
      },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          invalidate();
          onDeleted?.();
          onClose();
        },
      },
    );
  };

  // ── Background removal handlers ────────────────────────────────────────────

  const handleRemoveBackground = useCallback(async () => {
    const imageUrl = getImageUrl(item.imageObjectPath);
    if (!imageUrl) return;
    const myGen = ++bgGenRef.current;
    setBgPhase("processing");
    setCleanedUrl(null);
    setCleanedBlob(null);
    setBgSelected("cleaned");
    try {
      const resultUrl  = await removeBackground(imageUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob = await dataUrlToBlob(resultUrl);
      if (bgGenRef.current !== myGen) return;
      setCleanedBlob(resultBlob);
      setCleanedUrl(URL.createObjectURL(resultBlob));
      setBgPhase("preview");
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed:", err);
      setBgPhase("failed");
    }
  }, [item.imageObjectPath]);

  const handleApplyClean = useCallback(async () => {
    const blob = bgSelected === "cleaned" ? cleanedBlob : null;
    if (!blob) { setBgPhase("idle"); return; }
    const dataUrl = await blobToDataUrl(blob);
    updateItem.mutate(
      { id: item.id, data: { imageObjectPath: dataUrl } },
      {
        onSuccess: () => {
          invalidate();
          setBgPhase("idle");
          setCleanedUrl(null);
          setCleanedBlob(null);
        },
      },
    );
  }, [bgSelected, cleanedBlob, item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentImageUrl = getImageUrl(item.imageObjectPath);

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-3
                      bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">Item Details</h2>
        <div className="flex items-center gap-2">
          {/* Favourite toggle */}
          <button
            onClick={() => {
              const next = !form.isFavorite;
              patch("isFavorite")(next);
              updateItem.mutate(
                { id: item.id, data: { isFavorite: next } },
                { onSuccess: invalidate },
              );
            }}
            className={`w-9 h-9 border-2 border-black rounded-full flex items-center justify-center transition-all
                        ${form.isFavorite
                          ? "bg-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"}`}
          >
            <Heart
              className="w-4 h-4"
              fill={form.isFavorite ? "white" : "none"}
              stroke={form.isFavorite ? "white" : "currentColor"}
            />
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Photo + Background Removal */}
      {currentImageUrl && (
        <div className="flex-shrink-0 border-b-2 border-black">

          {/* ── idle: single photo with remove-bg button ── */}
          {bgPhase === "idle" && (
            <div className="relative">
              <div
                className="w-full h-52"
                style={{
                  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                  backgroundSize: "16px 16px",
                }}
              >
                <img
                  src={currentImageUrl}
                  alt={item.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <button
                onClick={handleRemoveBackground}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5
                           bg-white border-2 border-black rounded-full text-[11px] font-bold uppercase
                           shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Remove Background
              </button>
            </div>
          )}

          {/* ── processing: spinner over the image ── */}
          {bgPhase === "processing" && (
            <div className="relative w-full h-52">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                  backgroundSize: "16px 16px",
                }}
              >
                <img
                  src={currentImageUrl}
                  alt={item.name}
                  className="w-full h-full object-contain opacity-40"
                />
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-xs font-bold uppercase tracking-wider">Removing background…</p>
                <p className="text-[10px] text-black/50">First use downloads ~15 MB model</p>
              </div>
            </div>
          )}

          {/* ── failed ── */}
          {bgPhase === "failed" && (
            <div className="relative">
              <div
                className="w-full h-52"
                style={{
                  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                  backgroundSize: "16px 16px",
                }}
              >
                <img src={currentImageUrl} alt={item.name} className="w-full h-full object-contain" />
              </div>
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button
                  onClick={handleRemoveBackground}
                  className="flex items-center gap-1.5 px-3 py-1.5
                             bg-white border-2 border-black rounded-full text-[11px] font-bold uppercase
                             shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Retry
                </button>
                <button
                  onClick={() => setBgPhase("idle")}
                  className="flex items-center gap-1.5 px-3 py-1.5
                             bg-white border-2 border-black/30 rounded-full text-[11px] font-bold uppercase text-black/40
                             active:opacity-70 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── preview: side-by-side chooser ── */}
          {bgPhase === "preview" && cleanedUrl && (
            <div className="p-3 flex flex-col gap-3">
              <p style={{
                textAlign: "center", fontWeight: "bold", fontSize: 11,
                textTransform: "uppercase", letterSpacing: 2, opacity: 0.4, margin: 0,
              }}>
                Tap to choose
              </p>

              <div style={{ display: "flex", gap: 10 }}>
                {/* Original */}
                <button
                  onClick={() => setBgSelected("original")}
                  style={{
                    flex: 1,
                    opacity: bgSelected === "original" ? 1 : 0.5,
                    border: bgSelected === "original" ? "4px solid black" : "4px solid rgba(0,0,0,0.2)",
                    borderRadius: 14, overflow: "hidden", background: "none", padding: 0,
                  }}
                >
                  <div style={{ background: "black", minHeight: 140, position: "relative" }}>
                    <img src={currentImageUrl} alt="Original"
                         style={{ width: "100%", objectFit: "contain", maxHeight: 140, display: "block" }} />
                    {bgSelected === "original" && (
                      <div style={{
                        position: "absolute", top: 5, right: 5, width: 18, height: 18,
                        borderRadius: "50%", background: "black",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Check size={10} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p style={{ textAlign: "center", fontWeight: "bold", fontSize: 10,
                              textTransform: "uppercase", padding: "5px 0", margin: 0 }}>Original</p>
                </button>

                {/* Cleaned */}
                <button
                  onClick={() => setBgSelected("cleaned")}
                  style={{
                    flex: 1,
                    opacity: bgSelected === "cleaned" ? 1 : 0.5,
                    border: bgSelected === "cleaned" ? "4px solid black" : "4px solid rgba(0,0,0,0.2)",
                    borderRadius: 14, overflow: "hidden", background: "none", padding: 0,
                  }}
                >
                  <div style={{
                    background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                    minHeight: 140, position: "relative",
                  }}>
                    <img src={cleanedUrl} alt="Cleaned"
                         style={{ width: "100%", objectFit: "contain", maxHeight: 140, display: "block" }} />
                    {bgSelected === "cleaned" && (
                      <div style={{
                        position: "absolute", top: 5, right: 5, width: 18, height: 18,
                        borderRadius: "50%", background: "black",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Check size={10} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <p style={{ textAlign: "center", fontWeight: "bold", fontSize: 10,
                              textTransform: "uppercase", padding: "5px 0", margin: 0 }}>Cleaned ✨</p>
                </button>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setBgPhase("idle"); setCleanedUrl(null); setCleanedBlob(null); }}
                  className="flex-1 py-2.5 border-2 border-black rounded-xl font-display font-bold
                             text-xs uppercase tracking-tight bg-white
                             shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={handleApplyClean}
                  disabled={updateItem.isPending}
                  className="flex-1 py-2.5 border-2 border-black rounded-xl font-display font-bold
                             text-xs uppercase tracking-tight bg-primary
                             shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                             active:translate-x-0.5 active:translate-y-0.5 active:shadow-none
                             disabled:opacity-40 transition-all"
                >
                  {updateItem.isPending ? "Saving…" : bgSelected === "cleaned" ? "Apply ✨" : "Keep Original"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">
        <Field label="Item Name" value={form.name} onChange={patch("name") as (v: string) => void}
               placeholder="e.g. Gold Hoop Earrings" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand"  value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="e.g. Mejuri" />
          <Field label="Color"  value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Rose Gold" />
        </div>
        <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void}
               placeholder="Small, Medium, Large…" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          <Field label="Purchase Date"  value={form.purchaseDate}  onChange={patch("purchaseDate") as (v: string) => void}  type="date" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                       bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none
                       placeholder:font-normal placeholder:text-black/25"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Category" value={form.category}
                       onChange={patch("category") as (v: string) => void} options={CATEGORY_OPTIONS} />
          <div className="flex flex-col gap-1 opacity-50 pointer-events-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Times Worn</span>
            <div className="border-2 border-black/20 rounded-lg px-3 py-2 text-sm font-medium bg-white/50">
              {item.timesWorn ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2">
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
            >
              <Save className="w-4 h-4" />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                       font-bold uppercase border-2 border-black/20 text-black/35
                       hover:border-red-500 hover:text-red-600 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete from Vanity Forever
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-black bg-white
                         shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-red-600
                         bg-red-500 text-white shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                         disabled:opacity-50"
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
