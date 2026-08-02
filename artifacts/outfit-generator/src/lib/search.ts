/**
 * Scored full-text search over locally stored ClothingItem and SavedOutfit data.
 *
 * Field weights:
 *   name, brand          → 3.0  (highest)
 *   color, category      → 1.5
 *   notes, size, season,
 *   occasion, price, date → 1.0
 *   visionLabels, text   → 0.5  (lowest)
 *
 * Matching is substring-first; individual word matches score at 0.7× weight.
 * Results are deduplicated and sorted by descending score.
 */

import type { ClothingItem, SavedOutfit } from '@/types/local';

function scoreField(query: string, text: string | null | undefined, weight: number): number {
  if (!text || !query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return weight;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return 0;
  const matched = words.filter((w) => t.includes(w)).length;
  return matched > 0 ? weight * (matched / words.length) * 0.7 : 0;
}

function scoreItem(query: string, item: ClothingItem): number {
  let score = 0;
  score += scoreField(query, item.name,          3.0);
  score += scoreField(query, item.brand,         3.0);
  score += scoreField(query, item.color,         1.5);
  score += scoreField(query, item.category,      1.5);
  score += scoreField(query, item.notes,         1.0);
  score += scoreField(query, item.size,          1.0);
  score += scoreField(query, item.season,        1.0);
  score += scoreField(query, item.occasion,      1.0);
  score += scoreField(query, item.purchasePrice, 1.0);
  score += scoreField(query, item.purchaseDate,  1.0);
  for (const l of item.visionLabels ?? []) score += scoreField(query, l, 0.5);
  for (const t of item.visionText   ?? []) score += scoreField(query, t, 0.5);
  return score;
}

function scoreOutfit(query: string, outfit: SavedOutfit, allItems: ClothingItem[]): number {
  let score = 0;
  score += scoreField(query, outfit.name,  3.0);
  score += scoreField(query, outfit.notes, 1.0);

  // Also score items inside the group
  const memberIds = new Set(outfit.itemIds ?? []);
  const members = allItems.filter((i) => memberIds.has(i.id));
  const bestMember = Math.max(0, ...members.map((i) => scoreItem(query, i)));
  score += bestMember * 0.6; // member score contributes at 60%

  return score;
}

export interface ItemSearchResult {
  type: 'item';
  item: ClothingItem;
  score: number;
}

export interface GroupSearchResult {
  type: 'group';
  outfit: SavedOutfit;
  score: number;
}

export type SearchResult = ItemSearchResult | GroupSearchResult;

export function runSearch(
  query: string,
  items: ClothingItem[],
  outfits: SavedOutfit[],
): { items: ClothingItem[]; groups: SavedOutfit[] } {
  const q = query.trim();
  if (!q) return { items: [], groups: [] };

  const scoredItems = items
    .map((item) => ({ item, score: scoreItem(q, item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);

  const scoredGroups = outfits
    .map((outfit) => ({ outfit, score: scoreOutfit(q, outfit, items) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.outfit);

  return { items: scoredItems, groups: scoredGroups };
}
