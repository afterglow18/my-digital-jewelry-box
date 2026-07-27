import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

/**
 * Configure ONNX Runtime Web so inference runs in a Web Worker instead of
 * blocking the main JS thread.
 *
 * Three-part fix:
 *  1. Dynamic import() — avoids Vite pre-bundling onnxruntime-web at parse time,
 *     which triggers a page reload mid-session and corrupts React's dispatcher.
 *  2. Object.defineProperty to lock proxy = true — @imgly/background-removal
 *     internally resets `ort.env.wasm.proxy = false` before creating its
 *     inference session (it only enables the proxy when WebGPU is available,
 *     which it isn't on iOS Safari/WKWebView). A no-op setter silently blocks
 *     that write so ONNX Runtime keeps using its sub-worker.
 *  3. numThreads = 1 — iOS Safari has no SharedArrayBuffer, so WASM
 *     multithreading silently crashes. Single-threaded avoids it.
 */
let ortConfigured = false;
let warmUpStarted = false;

/**
 * Pre-warm the ONNX background-removal model so the first real invocation
 * feels instant. Pass a tiny 1×1 transparent PNG through the full pipeline —
 * this downloads and caches the ~15 MB ONNX model in the background without
 * blocking the main thread.
 *
 * Safe to call multiple times; only runs once per session (module-level guard).
 */
export async function warmUpBackgroundRemoval(): Promise<void> {
  if (warmUpStarted) return;
  warmUpStarted = true;

  try {
    // Minimal 1×1 transparent PNG as a data URL
    const tiny1x1Png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    await removeBackground(tiny1x1Png);
  } catch {
    // Warm-up failure is non-fatal — silently ignore so the real first
    // call can try again and surface any error through the normal path.
  }
}

async function configureOrt() {
  if (ortConfigured) return;
  ortConfigured = true;
  const ort = await import("onnxruntime-web");
  Object.defineProperty(ort.env.wasm, "proxy", {
    get: () => true,
    set: () => {}, // blocks imgly from resetting it to false
    configurable: true,
  });
  ort.env.wasm.numThreads = 1;
}

/**
 * Remove the background from a JPEG/PNG base64 data-URL.
 * Returns a PNG data-URL with transparent background.
 * Inference runs in a Web Worker — main thread stays responsive.
 * On first ever call downloads ~15 MB ONNX model from imgly CDN (cached after that).
 * Throws on network error or unreadable image — callers should catch and fall back.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  await configureOrt();
  const sourceBlob = await dataUrlToBlob(dataUrl);
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    model: "isnet_fp16", // valid: "isnet" | "isnet_fp16" | "isnet_quint8" — NOT "small"/"medium"
    output: { format: "image/png", quality: 0.9 },
    // publicPath omitted → uses static imgly CDN automatically
  });
  return blobToDataUrl(resultBlob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
