/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 *
 * Clean Up Photo flow:
 *  1. User taps "Clean Up Photo ✨" on the photo.
 *  2. A full-screen overlay slides up showing Original | Cleaned side-by-side.
 *  3. User taps their choice (pink ring + checkmark), taps the save button.
 *  4. Chosen data URL is stored in local state immediately (optimistic),
 *     DB write fires in the background — no flash back to old photo.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Trash2, Save, ChevronDown, Loader2, Check, Wand2 } from "lucide-react";
import type { ClothingItem, ClothingItemUpdateCategory } from "@/types/local";
import { useUpdateClothingItem, useDeleteClothingItem, getListClothingQueryKey } from "@/hooks/useLocalWardrobe";
import { getListOutfitsQueryKey } from "@/hooks/useLocalOutfits";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";
import { removeBackground } from "@/lib/backgroundRemoval";
import { AddToLookbookSheet } from "@/components/clothing/AddToLookbookSheet";

// ── Small field components ────────────────────────────────────────────────────

const SEASON_OPTIONS   = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS = ["rings", "earrings", "necklaces", "bracelets"];

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                   bg-white focus:outline-none focus:ring-2 focus:ring-primary
                   placeholder:font-normal placeholder:text-black/25" />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border-2 border-black rounded-lg px-3 py-2 pr-8
                     text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
          {options.map((o) => <option key={o} value={o}>{o || `— ${label} —`}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-black/40" />
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
  /**
   * When true: show "Add to Lookbook" as the second action button instead of
   * "Clean Up Photo". Pass true from search results and favorites; never from
   * the main wardrobe. Either way "Wearing Today" always shows.
   */
  showAddToLookbook?: boolean;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
  timesWorn: string;          // editable number stored as string
  lastWornDate: string | null; // "YYYY-MM-DD" local date, null if never worn
}

function toForm(item: ClothingItem): FormState {
  return {
    name: item.name ?? "", brand: item.brand ?? "", color: item.color ?? "",
    size: item.size ?? "", season: item.season ?? "", occasion: item.occasion ?? "",
    purchasePrice: item.purchasePrice ?? "", purchaseDate: item.purchaseDate ?? "",
    notes: item.notes ?? "", isFavorite: item.isFavorite ?? false, category: item.category ?? "",
    timesWorn: String(item.timesWorn ?? 0),
    lastWornDate: (item as ClothingItem & { lastWornDate?: string | null }).lastWornDate ?? null,
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  const itemLastWorn = (item as ClothingItem & { lastWornDate?: string | null }).lastWornDate ?? null;
  return (
    form.name !== (item.name ?? "") || form.brand !== (item.brand ?? "") ||
    form.color !== (item.color ?? "") || form.size !== (item.size ?? "") ||
    form.season !== (item.season ?? "") || form.occasion !== (item.occasion ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") || form.purchaseDate !== (item.purchaseDate ?? "") ||
    form.notes !== (item.notes ?? "") || form.isFavorite !== (item.isFavorite ?? false) ||
    form.category !== (item.category ?? "") ||
    form.timesWorn !== String(item.timesWorn ?? 0) ||
    form.lastWornDate !== itemLastWorn
  );
}

// ── Full-screen bg-removal overlay ───────────────────────────────────────────

type BgStatus = "processing" | "ready" | "failed";

function BgRemovalOverlay({
  originalUrl,
  onClose,
  onSave,
}: {
  originalUrl: string;
  onClose: () => void;
  /** Called with the chosen data URL immediately — optimistic, DB write is caller's job. */
  onSave: (chosenDataUrl: string) => void;
}) {
  const [status,     setStatus]     = useState<BgStatus>("processing");
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  // default to "original" while cleaning runs; auto-switch to "cleaned" when done
  // unless the user has manually picked "original"
  const [selected,       setSelected]       = useState<"original" | "cleaned">("original");
  const userPickedManually = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    removeBackground(originalUrl)
      .then((url) => {
        if (cancelled.current) return;
        setCleanedUrl(url);
        setStatus("ready");
        // auto-select cleaned only if user hasn't tapped original intentionally
        if (!userPickedManually.current) setSelected("cleaned");
      })
      .catch((err) => {
        if (cancelled.current) return;
        console.warn("Background removal failed:", err);
        setStatus("failed");
      });
    return () => { cancelled.current = true; };
  }, [originalUrl]);

  const handleSelect = (choice: "original" | "cleaned") => {
    userPickedManually.current = true;
    setSelected(choice);
  };

  const handleSave = () => {
    const url = selected === "cleaned" && cleanedUrl ? cleanedUrl : originalUrl;
    onSave(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-3 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">Clean Up Photo</h2>
        <button onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body — always show side-by-side, cleaned card shows spinner while processing */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {status === "failed" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="text-5xl">😕</span>
            <p className="font-display font-bold text-lg uppercase">Couldn't remove background</p>
            <p className="text-sm text-black/50">Check your connection and try again.</p>
            <button onClick={onClose}
              className="mt-2 px-6 py-3 border-2 border-black rounded-xl font-bold text-sm uppercase
                         bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
              Go Back
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-5">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-black/40">
              {status === "processing" ? "Cleaning up photo…" : "Tap to choose"}
            </p>

            <div className="flex gap-3">
              {/* Original card — always interactive */}
              <button
                onClick={() => handleSelect("original")}
                className="flex-1 flex flex-col rounded-2xl overflow-hidden transition-all"
                style={{
                  outline: selected === "original" ? "3px solid #7c3aed" : "3px solid transparent",
                  outlineOffset: 2,
                }}
              >
                <div className="relative bg-black flex-1" style={{ minHeight: 200 }}>
                  <img src={originalUrl} alt="Original"
                    className="w-full object-contain" style={{ maxHeight: 200, display: "block" }} />
                  {selected === "original" && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600
                                    flex items-center justify-center shadow">
                      <Check size={13} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <div className="bg-white py-2 text-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Original</span>
                </div>
              </button>

              {/* Cleaned card — spinner while processing, image when ready */}
              <button
                onClick={() => status === "ready" && handleSelect("cleaned")}
                disabled={status === "processing"}
                className="flex-1 flex flex-col rounded-2xl overflow-hidden transition-all"
                style={{
                  outline: selected === "cleaned" && status === "ready" ? "3px solid #7c3aed" : "3px solid transparent",
                  outlineOffset: 2,
                  opacity: status === "processing" ? 0.6 : 1,
                  cursor: status === "processing" ? "default" : "pointer",
                }}
              >
                <div className="relative flex-1 flex items-center justify-center"
                  style={{
                    minHeight: 200,
                    background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                  }}>
                  {status === "processing" ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 animate-spin text-black/40" strokeWidth={1.5} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">Processing…</span>
                    </div>
                  ) : cleanedUrl ? (
                    <>
                      <img src={cleanedUrl} alt="Cleaned"
                        className="w-full object-contain" style={{ maxHeight: 200, display: "block" }} />
                      {selected === "cleaned" && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-600
                                        flex items-center justify-center shadow">
                          <Check size={13} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
                <div className="bg-white py-2 text-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Cleaned ✨</span>
                </div>
              </button>
            </div>


          </div>
        )}
      </div>

      {/* Footer — always visible (except failed state) */}
      {status !== "failed" && (
        <div className="px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <button
            onClick={handleSave}
            className="w-full py-3.5 border-2 border-black rounded-xl font-display font-bold
                       text-sm uppercase tracking-tight bg-primary
                       shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                       active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            {selected === "cleaned" && status === "ready" ? "Save Cleaned Version ✨" : "Save Original"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 border-2 border-black/20 rounded-xl font-bold text-sm
                       uppercase tracking-tight text-black/40
                       active:opacity-60 transition-all"
          >
            Cancel
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ItemDetailsSheet({ item, onClose, onDeleted, showAddToLookbook = false }: ItemDetailsSheetProps) {
  const [form, setForm]                           = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bgOverlayOpen, setBgOverlayOpen]         = useState(false);
  const [lookbookOpen, setLookbookOpen]           = useState(false);

  // Optimistic image URL — updated instantly when user picks in the overlay,
  // before the DB write completes, so the sheet never flashes back to the old photo.
  const [optimisticImageUrl, setOptimisticImageUrl] = useState<string | null>(null);

  // Saved before logging today so "Undo" can restore the previous lastWornDate.
  const prevLastWornDateRef = useRef<string | null>(null);

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (item) setForm(toForm(item));
    setShowDeleteConfirm(false);
    setOptimisticImageUrl(null);
    setBgOverlayOpen(false);
    prevLastWornDateRef.current = null;
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
  }, [queryClient]);

  // Optimistic save: update local state immediately, fire DB write in background.
  // Must be defined before the early return so hook count is stable every render.
  const handleBgSave = useCallback((chosenDataUrl: string) => {
    setOptimisticImageUrl(chosenDataUrl);  // instant visual update — no flash
    setBgOverlayOpen(false);
    updateItem.mutate(
      { id: item?.id ?? "", data: { imageObjectPath: chosenDataUrl } },
      { onSuccess: () => invalidate() },
    );
  }, [item?.id, invalidate, updateItem]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !form) return null;

  // ── Wear tracking ──────────────────────────────────────────────────────────

  /** Today as "YYYY-MM-DD" in the device's local timezone (en-CA locale gives that format). */
  const todayStr = new Date().toLocaleDateString("en-CA");
  const isLoggedToday = form.lastWornDate === todayStr;

  const handleLogToday = () => {
    prevLastWornDateRef.current = form.lastWornDate;
    const newCount = (parseInt(form.timesWorn) || 0) + 1;
    setForm((prev) => prev ? { ...prev, timesWorn: String(newCount), lastWornDate: todayStr } : prev);
    updateItem.mutate(
      { id: item.id, data: { timesWorn: newCount, lastWornDate: todayStr } },
      { onSuccess: () => invalidate() },
    );
  };

  const handleUndoLog = () => {
    const prevDate = prevLastWornDateRef.current;
    const newCount = Math.max(0, (parseInt(form.timesWorn) || 0) - 1);
    setForm((prev) => prev ? { ...prev, timesWorn: String(newCount), lastWornDate: prevDate ?? null } : prev);
    updateItem.mutate(
      { id: item.id, data: { timesWorn: newCount, lastWornDate: prevDate ?? null } },
      { onSuccess: () => invalidate() },
    );
  };

  /** "YYYY-MM-DD" → "M/D/YY" without using new Date() (avoids UTC-shift off-by-one). */
  const formatLastWorn = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return `${m}/${day}/${String(y).slice(2)}`;
  };

  // ── Form helpers ───────────────────────────────────────────────────────────

  const dirty = isDirty(form, item);
  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name: form.name.trim() || item.name,
          brand: form.brand.trim() || null, color: form.color.trim() || null,
          size: form.size.trim() || null, season: form.season || null,
          occasion: form.occasion || null, purchasePrice: form.purchasePrice.trim() || null,
          purchaseDate: form.purchaseDate.trim() || null, notes: form.notes.trim() || null,
          isFavorite: form.isFavorite,
          category: (form.category || item.category) as ClothingItemUpdateCategory,
          timesWorn: Math.max(0, parseInt(form.timesWorn) || 0),
          lastWornDate: form.lastWornDate,
        },
      },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      { onSuccess: () => { invalidate(); onDeleted?.(); onClose(); } },
    );
  };

  // The image to display — optimistic takes priority over what's in the DB record.
  const displayedImageUrl = optimisticImageUrl ?? getImageUrl(item.imageObjectPath) ?? null;

  // Hide "Clean Up Photo" once the background has already been removed.
  // Cleaned images are stored as PNG data URLs; originals are JPEGs.
  const alreadyCleaned = !!(displayedImageUrl?.startsWith("data:image/png"));

  return (
    <>
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
            <button
              onClick={() => {
                const next = !form.isFavorite;
                patch("isFavorite")(next);
                updateItem.mutate({ id: item.id, data: { isFavorite: next } }, { onSuccess: invalidate });
              }}
              className={`w-9 h-9 border-2 border-black rounded-full flex items-center justify-center transition-all
                          ${form.isFavorite
                            ? "bg-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                            : "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"}`}>
              <Heart className="w-4 h-4"
                fill={form.isFavorite ? "white" : "none"}
                stroke={form.isFavorite ? "white" : "currentColor"} />
            </button>
            <button onClick={onClose}
              className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                         bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Photo */}
        {displayedImageUrl && (
          <div className="w-full h-52 flex-shrink-0"
            style={{
              backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
              backgroundSize: "16px 16px",
            }}>
            <img src={displayedImageUrl} alt={item.name}
              className="w-full h-full object-contain" />
          </div>
        )}

        {/* Action buttons row — below photo */}
        <div className="flex gap-2 px-3 py-2 border-b-2 border-black flex-shrink-0">
          {!isLoggedToday ? (
            <button
              onClick={handleLogToday}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                         bg-white border-2 border-black rounded-full text-[11px] font-bold uppercase
                         shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
              Wearing Today
            </button>
          ) : (
            <button
              onClick={handleUndoLog}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                         bg-primary border-2 border-black rounded-full text-[11px] font-bold uppercase
                         shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
              <Check className="w-3 h-3" /> Logged · Undo
            </button>
          )}
          {showAddToLookbook ? (
            <button
              onClick={() => setLookbookOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                         bg-white border-2 border-black rounded-full text-[11px] font-bold uppercase
                         shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                         active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
              <span>💍</span>
              Add to Lookbook
            </button>
          ) : (
            !alreadyCleaned && (
              <button
                onClick={() => setBgOverlayOpen(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                           bg-white border-2 border-black rounded-full text-[11px] font-bold uppercase
                           shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
                <Wand2 className="w-3.5 h-3.5" />
                Clean Up Photo
              </button>
            )
          )}
        </div>

        {/* Form */}
        <div className="flex-1 px-4 py-5 flex flex-col gap-4">
          <Field label="Item Name" value={form.name} onChange={patch("name") as (v: string) => void}
                 placeholder="e.g. Gold Hoop Earrings" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="e.g. Mejuri" />
            <Field label="Color" value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Rose Gold" />
          </div>
          <Field label="Size" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="Small, Medium, Large…" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
            <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
            <Field label="Purchase Date"  value={form.purchaseDate}  onChange={patch("purchaseDate")  as (v: string) => void} type="date" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Notes</label>
            <textarea value={form.notes} onChange={(e) => patch("notes")(e.target.value)}
              placeholder="Anything worth remembering…" rows={3}
              className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                         bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none
                         placeholder:font-normal placeholder:text-black/25" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Category" value={form.category}
                         onChange={patch("category") as (v: string) => void} options={CATEGORY_OPTIONS} />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Times Worn</span>
              <input
                type="number" min="0"
                value={form.timesWorn}
                onChange={(e) => patch("timesWorn")(e.target.value)}
                className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm font-medium
                           bg-white focus:outline-none focus:ring-2 focus:ring-primary" />
              {form.lastWornDate && (
                <span className="text-[10px] text-black/40 mt-0.5">
                  Last worn: {formatLastWorn(form.lastWornDate)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2">
          <AnimatePresence>
            {dirty && (
              <motion.button
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                onClick={handleSave} disabled={updateItem.isPending}
                className="w-full btn-brutalist py-3 rounded-xl flex items-center justify-center gap-2 text-sm">
                <Save className="w-4 h-4" />
                {updateItem.isPending ? "Saving…" : "Save Changes"}
              </motion.button>
            )}
          </AnimatePresence>

          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                         font-bold uppercase border-2 border-black/20 text-black/35
                         hover:border-red-500 hover:text-red-600 transition-all">
              <Trash2 className="w-4 h-4" />
              Delete from Jewelry Box
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-black bg-white
                           shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleteItem.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-bold uppercase border-2 border-red-600
                           bg-red-500 text-white shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all
                           disabled:opacity-50">
                {deleteItem.isPending ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Full-screen bg removal overlay — slides up above the details sheet */}
      <AnimatePresence>
        {bgOverlayOpen && displayedImageUrl && (
          <BgRemovalOverlay
            key="bg-overlay"
            originalUrl={displayedImageUrl}
            onClose={() => setBgOverlayOpen(false)}
            onSave={handleBgSave}
          />
        )}
      </AnimatePresence>

      {/* Add to Lookbook picker */}
      <AnimatePresence>
        {lookbookOpen && (
          <AddToLookbookSheet
            key="lookbook-sheet"
            item={item}
            onClose={() => setLookbookOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
