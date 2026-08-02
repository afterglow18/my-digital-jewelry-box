/**
 * AddToLookbookSheet — slide-up picker showing all saved groups.
 * Each group shows a 3-thumbnail preview + its name. Groups that already
 * contain the item display a filled checkmark. Tapping toggles membership.
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import type { ClothingItem, SavedOutfit } from "@/types/local";
import {
  useListOutfits,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
} from "@/hooks/useLocalOutfits";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

interface Props {
  item: ClothingItem;
  onClose: () => void;
}

function GroupThumbnails({ outfit }: { outfit: SavedOutfit }) {
  const previews = (outfit.items ?? []).slice(0, 3);
  return (
    <div className="flex gap-1">
      {Array.from({ length: 3 }).map((_, i) => {
        const member = previews[i];
        return (
          <div
            key={i}
            className="w-11 h-11 border-2 border-black rounded overflow-hidden flex-shrink-0"
            style={{ background: "#FDECEF" }}
          >
            {member?.imageObjectPath ? (
              <img
                src={getImageUrl(member.imageObjectPath)!}
                alt={member.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-[10px] text-black/20">—</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AddToLookbookSheet({ item, onClose }: Props) {
  const { data: outfits = [] } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });

  const isInOutfit = (outfit: SavedOutfit) =>
    (outfit.itemIds ?? []).includes(item.id);

  const handleToggle = (outfit: SavedOutfit) => {
    if (isInOutfit(outfit)) {
      removeItem.mutate(
        { id: outfit.id, itemId: item.id },
        { onSuccess: invalidate },
      );
    } else {
      addItem.mutate(
        { id: outfit.id, data: { itemId: item.id } },
        { onSuccess: invalidate },
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 260 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 pb-3
                   bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Add to Lookbook
        </h2>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {outfits.length === 0 ? (
          <p className="text-sm text-black/40 text-center mt-8">
            No saved groups yet. Head to Generate to save a look first.
          </p>
        ) : (
          outfits.map((outfit) => {
            const included = isInOutfit(outfit);
            return (
              <button
                key={outfit.id}
                onClick={() => handleToggle(outfit)}
                className={`w-full flex items-center gap-3 p-3 border-2 rounded-xl text-left transition-all
                            ${included
                              ? "border-black bg-primary shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                              : "border-black/20 bg-white hover:border-black/50"}`}
              >
                <GroupThumbnails outfit={outfit} />
                <span className="flex-1 font-display font-bold text-sm uppercase tracking-tight truncate">
                  {outfit.name}
                </span>
                {included && (
                  <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
