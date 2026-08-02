/**
 * useVisionIndexer — background photo analysis hook.
 *
 * On mount: finds all items whose visionVersion < WEB_TARGET (or iOS target)
 * and processes them one at a time with a 350 ms delay so the UI stays
 * responsive. Returns isIndexing + progress so callers can show a toast.
 *
 * visionVersion meanings: 0=unanalyzed, 1=iOS Vision, 4=web canvas, 5=web/no-labels
 * Re-runs anything below 4 on web (except 5=skip).
 * Re-runs anything below 1 on iOS.
 */

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { dbListClothing, dbUpdateVisionData } from '@/lib/db';
import { extractVisionData } from '@/lib/visionExtract';
import { useQueryClient } from '@tanstack/react-query';
import { getListClothingQueryKey } from '@/hooks/useLocalWardrobe';

const WEB_TARGET = 4;
/**
 * v2 = iOS Vision + canvas color (current).
 * v1 = old iOS-only (no colors) — must be re-indexed.
 */
const IOS_TARGET = 2;
const DELAY_MS   = 350;

export interface IndexerState {
  isIndexing: boolean;
  done: number;
  total: number;
}

export function useVisionIndexer(): IndexerState {
  const [state, setState] = useState<IndexerState>({ isIndexing: false, done: 0, total: 0 });
  const abortRef     = useRef(false);
  const queryClient  = useQueryClient();

  useEffect(() => {
    abortRef.current = false;

    (async () => {
      const items = await dbListClothing();
      const target = Capacitor.isNativePlatform() ? IOS_TARGET : WEB_TARGET;

      const todo = items.filter((item) => {
        const v = item.visionVersion ?? 0;
        if (!item.imageObjectPath) return false;
        if (v === 5) return false;     // web ran, found nothing — skip
        return v < target;
      });

      if (todo.length === 0) return;

      setState({ isIndexing: true, done: 0, total: todo.length });

      for (let i = 0; i < todo.length; i++) {
        if (abortRef.current) break;

        const item = todo[i];
        try {
          const result = await extractVisionData(item.imageObjectPath!);
          await dbUpdateVisionData(item.id, {
            visionLabels:  result.labels,
            visionText:    result.text,
            visionVersion: result.version,
          });
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
        } catch {
          // silently skip — text search still works
        }

        setState({ isIndexing: true, done: i + 1, total: todo.length });

        if (i < todo.length - 1) {
          await new Promise((res) => setTimeout(res, DELAY_MS));
        }
      }

      setState({ isIndexing: false, done: todo.length, total: todo.length });
    })();

    return () => { abortRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

/**
 * Queue a single item for immediate analysis (e.g. after a new photo is added).
 * Runs independently of the background indexer.
 */
export async function analyzeItemNow(
  itemId: string,
  dataUrl: string,
  queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>,
): Promise<void> {
  try {
    const result = await extractVisionData(dataUrl);
    await dbUpdateVisionData(itemId, {
      visionLabels:  result.labels,
      visionText:    result.text,
      visionVersion: result.version,
    });
    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
  } catch {
    // silently skip
  }
}
