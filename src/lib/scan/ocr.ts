/**
 * OCR via tesseract.js (WASM, runs entirely in the browser).
 *
 * Design decisions:
 * - A single Tesseract Worker is created lazily and reused across calls to
 *   avoid the ~300ms initialisation overhead on every page.
 * - The worker is terminated after 60 s of inactivity so it doesn't hold
 *   memory forever when the user is no longer scanning.
 * - `recognizePage` accepts a canvas, a Blob, or an image URL so it can be
 *   called both from CaptureFlow (canvas) and from a retroactive OCR pass
 *   on existing pages (URL).
 * - Errors are caught and returned as null — OCR failure must never block
 *   the main scan/save flow.
 */

import type { Worker } from "tesseract.js";

export type OcrProgress = {
  status: string;
  /** 0–1, or -1 when indeterminate */
  progress: number;
};

// ── Worker lifecycle ──────────────────────────────────────────────────────────

let _worker: Worker | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_TTL_MS = 60_000;

async function getWorker(): Promise<Worker> {
  if (_worker) {
    resetIdleTimer();
    return _worker;
  }

  // Dynamic import keeps tesseract.js (~10 MB WASM) out of the initial bundle.
  const { createWorker } = await import("tesseract.js");

  // Load Portuguese + English — covers the most common use cases.
  // The language packs are fetched from jsDelivr CDN on first use (~4 MB each)
  // and cached in the browser's Cache API automatically by tesseract.js.
  _worker = await createWorker(["por", "eng"], 1, {
    // Use the CDN so we don't need to bundle the language data.
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data",
    cacheMethod: "write",
    logger: () => {
      // suppress verbose internal logs
    },
  });

  resetIdleTimer();
  return _worker;
}

function resetIdleTimer() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(async () => {
    if (_worker) {
      await _worker.terminate();
      _worker = null;
    }
  }, IDLE_TTL_MS);
}

// ── Public API ────────────────────────────────────────────────────────────────

export type OcrInput = HTMLCanvasElement | Blob | string;

/**
 * Run OCR on a single page image.
 *
 * @param image  Canvas, Blob, or URL of the image to recognise.
 * @param onProgress  Optional callback with status / progress (0–1).
 * @returns  Extracted text, or `null` on failure.
 */
export async function recognizePage(
  image: OcrInput,
  onProgress?: (p: OcrProgress) => void,
): Promise<string | null> {
  try {
    const worker = await getWorker();

    // Tesseract.js 5 supports canvas, blob and URL directly.
    const result = await worker.recognize(image as Parameters<typeof worker.recognize>[0], {}, {
      // Re-use the same scheduler; tesseract.js handles concurrency internally.
    });

    onProgress?.({ status: "done", progress: 1 });

    const text = result.data.text.trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.warn("[OCR] recognition failed:", err);
    return null;
  }
}

/**
 * Terminate the shared worker immediately.
 * Useful for cleanup in tests or when the user logs out.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (_idleTimer) clearTimeout(_idleTimer);
  if (_worker) {
    await _worker.terminate();
    _worker = null;
  }
}
