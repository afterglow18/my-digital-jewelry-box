/**
 * Vision extraction — dominant color detection (web canvas) + iOS Vision bridge.
 *
 * Version scheme:
 *   0 = unanalyzed
 *   1 = iOS Vision (labels + text via VNClassifyImageRequest / VNRecognizeTextRequest)
 *   4 = web canvas (color names extracted from 48×48 downscale)
 *   5 = web ran but found no labels — skip retry
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ── iOS Vision plugin bridge ──────────────────────────────────────────────────

interface VisionPluginInterface {
  analyze(options: { dataUrl: string }): Promise<{ labels: string[]; text: string[] }>;
}

const VisionPlugin = registerPlugin<VisionPluginInterface>('VisionPlugin');

// ── Color name mapping ────────────────────────────────────────────────────────

/** Convert HSV hue (0–360) + saturation + brightness → English color name. */
function rgbToColorName(r: number, g: number, b: number): string {
  const brightness = (r + g + b) / 3;

  // Achromatic thresholds
  if (brightness < 80)  return 'black';
  if (brightness < 110) return 'dark grey';
  if (brightness < 175) return 'grey';

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (brightness < 225 && saturation < 0.15) return 'light grey';
  if (saturation < 0.12) return 'white';

  // Warm neutrals — high red channel, lower saturation
  if (r > g && r > b) {
    if (brightness > 185 && saturation < 0.30) return 'beige';
    if (brightness > 130 && saturation < 0.50) return 'tan';
    if (saturation < 0.65) return 'brown';
  }

  // Compute hue
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }

  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 40)  return 'orange';
  if (hue < 70)  return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 200) return 'teal';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

// ── Web canvas color extraction ───────────────────────────────────────────────

const CANVAS_SIZE = 48;
const CORNER_PATCH = 4;
const BG_DIST_THRESHOLD = 30;
const MIN_FOREGROUND_FRACTION = 0.10;

function colorDist(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  return Math.sqrt(
    (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2,
  );
}

async function extractWebColors(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }

      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Detect background: average the 4×4 corner patches
      let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
      for (let cy = 0; cy < CANVAS_SIZE; cy += CANVAS_SIZE - CORNER_PATCH) {
        for (let cx = 0; cx < CANVAS_SIZE; cx += CANVAS_SIZE - CORNER_PATCH) {
          for (let py = cy; py < cy + CORNER_PATCH; py++) {
            for (let px = cx; px < cx + CORNER_PATCH; px++) {
              const idx = (py * CANVAS_SIZE + px) * 4;
              if (data[idx + 3] < 128) continue; // skip transparent
              bgR += data[idx]; bgG += data[idx + 1]; bgB += data[idx + 2];
              bgCount++;
            }
          }
        }
      }
      if (bgCount > 0) { bgR /= bgCount; bgG /= bgCount; bgB /= bgCount; }

      // Count color names over foreground pixels
      const colorCounts: Record<string, number> = {};
      let foregroundTotal = 0;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 128) continue; // transparent
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (colorDist(r, g, b, bgR, bgG, bgB) < BG_DIST_THRESHOLD) continue;
        foregroundTotal++;
        const name = rgbToColorName(r, g, b);
        colorCounts[name] = (colorCounts[name] ?? 0) + 1;
      }

      if (foregroundTotal === 0) { resolve([]); return; }

      const labels = Object.entries(colorCounts)
        .filter(([, count]) => count / foregroundTotal >= MIN_FOREGROUND_FRACTION)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);

      resolve(labels);
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface VisionResult {
  labels: string[];
  text: string[];
  /** The version number to store (4 for web, 1 for iOS, 5 if web found nothing). */
  version: number;
}

export async function extractVisionData(dataUrl: string): Promise<VisionResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { labels, text } = await VisionPlugin.analyze({ dataUrl });
      return { labels, text, version: 1 };
    } catch {
      // Fall through to web canvas as fallback
    }
  }

  // Web canvas
  const labels = await extractWebColors(dataUrl);
  return {
    labels,
    text: [],
    version: labels.length > 0 ? 4 : 5,
  };
}
