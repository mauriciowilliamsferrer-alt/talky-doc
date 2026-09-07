import { PDFDocument } from "pdf-lib";
import type { ScanPage } from "./docs";

async function fetchBytes(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível carregar a página");
  return new Uint8Array(await res.arrayBuffer());
}

export async function buildPdf(name: string, pages: ScanPage[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(name);
  // Fetch all page images in parallel, then embed in order.
  const bytesArray = await Promise.all(pages.map((p) => fetchBytes(p.url)));
  for (let i = 0; i < pages.length; i++) {
    const image = await pdf.embedJpg(bytesArray[i]!);
    const p = pdf.addPage([image.width, image.height]);
    p.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const out = await pdf.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared" as const;
    } catch {
      /* user cancelled — fall through to download */
    }
  }
  downloadBlob(blob, filename);
  return "downloaded" as const;
}

export function safeFileName(name: string) {
  const sanitized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return sanitized || "documento";
}
