import type { CapturedPage } from "@/components/scan/CaptureFlow";
import { applyFilter, canvasToJpeg, loadImageToCanvas } from "@/lib/scan/image";
import { recognizePage } from "@/lib/scan/ocr";

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_PDF_PAGES = 30;

async function canvasToPage(canvas: HTMLCanvasElement): Promise<CapturedPage> {
  const enhanced = applyFilter(canvas, "enhance");
  const blob = await canvasToJpeg(enhanced, 0.85);
  let ocrText: string | null = null;
  try {
    ocrText = await recognizePage(enhanced);
  } catch {
    ocrText = null;
  }
  return {
    id: crypto.randomUUID(),
    blob,
    width: enhanced.width,
    height: enhanced.height,
    previewUrl: URL.createObjectURL(blob),
    ocrText,
  };
}

async function pdfToCanvases(file: File, onProgress: (done: number, total: number) => void) {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (doc.numPages > MAX_IMPORT_PDF_PAGES) {
    throw new Error(`O PDF tem ${doc.numPages} páginas. O limite é ${MAX_IMPORT_PDF_PAGES}.`);
  }
  const out: HTMLCanvasElement[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 2000 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(canvas);
      onProgress(i, doc.numPages);
    }
  } finally {
    void doc.cleanup();
  }
  return out;
}

/** Turns uploaded images/PDFs into scanned pages (with OCR awaited). */
export async function importFiles(
  files: File[],
  onProgress: (label: string) => void,
): Promise<CapturedPage[]> {
  const pages: CapturedPage[] = [];
  for (const file of files) {
    if (file.size > MAX_IMPORT_BYTES) throw new Error(`"${file.name}" passa de 20 MB.`);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      onProgress(`Abrindo ${file.name}…`);
      const canvases = await pdfToCanvases(file, (d, t) => onProgress(`Abrindo página ${d} de ${t}…`));
      for (let i = 0; i < canvases.length; i++) {
        onProgress(`Reconhecendo texto: página ${i + 1} de ${canvases.length}…`);
        pages.push(await canvasToPage(canvases[i]));
      }
    } else if (file.type.startsWith("image/")) {
      onProgress(`Reconhecendo texto de ${file.name}…`);
      pages.push(await canvasToPage(await loadImageToCanvas(file)));
    } else {
      throw new Error(`"${file.name}" não é imagem nem PDF.`);
    }
  }
  return pages;
}
