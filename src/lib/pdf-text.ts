export type PdfExtraction = {
  title: string;
  pages: string[];
  text: string;
  charCount: number;
};

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Extracts selectable text from a PDF, page by page, in reading order. */
export async function extractPdfText(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let out = "";
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          out += out.endsWith("-") ? "" : "\n";
        }
        out += item.str;
        if (item.hasEOL) out += "\n";
        lastY = y;
      }
      pages.push(normalize(out));
      onProgress?.(i, doc.numPages);
    }
  } finally {
    void (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }

  let metaTitle = "";
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info as { Title?: unknown } | undefined;
    if (typeof info?.Title === "string") metaTitle = info.Title.trim();
  } catch {
    /* metadados indisponíveis: usamos o nome do arquivo */
  }


  const text = pages.join("\n\n").trim();
  return {
    title: metaTitle || file.name.replace(/\.pdf$/i, ""),
    pages,
    text,
    charCount: text.length,
  };
}

function normalize(raw: string) {
  return raw
    .replace(/-\n(\p{Ll})/gu, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/** Splits text into chunks that stay well under the model input limit. */
export function chunkForTTS(text: string, maxChars = 1800): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    const pieces =
      paragraph.length > maxChars
        ? (paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph])
        : [paragraph];

    for (const piece of pieces) {
      if (piece.length > maxChars) {
        push();
        for (let i = 0; i < piece.length; i += maxChars) chunks.push(piece.slice(i, i + maxChars));
        continue;
      }
      if (current.length + piece.length + 2 > maxChars) push();
      current += (current ? "\n" : "") + piece.trim();
    }
  }

  push();
  return chunks.filter(Boolean);
}

/** ~155 words per minute of narration. */
export function estimateMinutes(charCount: number) {
  return Math.max(1, Math.round(charCount / 5 / 155));
}
