/**
 * Local outfit hooks — replaces @workspace/api-client-react outfit hooks.
 * Uses React Query backed by IndexedDB.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  dbListOutfits,
  dbCreateOutfit,
  dbUpdateOutfit,
  dbDeleteOutfit,
  dbAddItemToOutfit,
  dbRemoveItemFromOutfit,
  dbBulkAdjustTimesWorn,
} from '@/lib/db';
import type { SavedOutfit } from '@/types/local';

// ── Query key ─────────────────────────────────────────────────────────────────

export function getListOutfitsQueryKey() {
  return ['outfits', 'list'];
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useListOutfits() {
  return useQuery<SavedOutfit[]>({
    queryKey: getListOutfitsQueryKey(),
    queryFn: dbListOutfits,
    staleTime: 0,
  });
}

// ── Create / Save ─────────────────────────────────────────────────────────────

export function useSaveOutfit() {
  const qc = useQueryClient();
  return useMutation<SavedOutfit, Error, { data: { name: string; itemIds: string[] } }>({
    mutationFn: ({ data }) => dbCreateOutfit(data.name, data.itemIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

// ── Rename / Update notes ─────────────────────────────────────────────────────

export function useRenameOutfit() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; data: { name?: string; notes?: string | null } }
  >({
    mutationFn: ({ id, data }) => dbUpdateOutfit(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteOutfit() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => dbDeleteOutfit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

// ── Add item to outfit ────────────────────────────────────────────────────────

export function useAddItemToOutfit() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; data: { itemId: string } }>({
    mutationFn: ({ id, data }) => dbAddItemToOutfit(id, data.itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

// ── Remove item from outfit ───────────────────────────────────────────────────

export function useRemoveItemFromOutfit() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; itemId: string }>({
    mutationFn: ({ id, itemId }) => dbRemoveItemFromOutfit(id, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    },
  });
}

// ── Log outfit used today / undo ──────────────────────────────────────────────

/**
 * Log (or undo-log) that a saved group was worn today.
 * - Updates the outfit's lastUsedDate in the outfits store.
 * - Bulk-adjusts timesWorn (+1 or -1) on every clothing item in the group.
 * - Invalidates both outfit and clothing caches so every card reflects the new counts.
 */
export function useLogOutfitUsed() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { outfitId: string; itemIds: string[]; lastUsedDate: string | null; delta: 1 | -1 }
  >({
    mutationFn: async ({ outfitId, itemIds, lastUsedDate, delta }) => {
      await Promise.all([
        dbUpdateOutfit(outfitId, { lastUsedDate }),
        dbBulkAdjustTimesWorn(itemIds, delta),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
      qc.invalidateQueries({ queryKey: ['clothing'] });
    },
  });
}

// ── Re-export type ────────────────────────────────────────────────────────────
export type { SavedOutfit };
