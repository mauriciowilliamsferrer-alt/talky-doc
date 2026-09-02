export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point]; // tl, tr, br, bl
export type FilterKind = "color" | "gray" | "bw" | "enhance";

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    const tmp = m[col]!;
    m[col] = m[pivot]!;
    m[pivot] = tmp;
    const p = m[col]![col]!;
    if (Math.abs(p) < 1e-12) continue;
    for (let c = col; c <= n; c++) m[col]![c] = m[col]![c]! / p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  return m.map((row) => row[n]!);
}

/** Homography mapping the destination rectangle back onto the source quad. */
function homography(dst: Quad, src: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i]!;
    const { x: u, y: v } = src[i]!;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solve(A, b);
  return [...h, 1];
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function outputSize(quad: Quad, max = 2000) {
  const w = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  const h = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(64, Math.round(w * scale)),
    height: Math.max(64, Math.round(h * scale)),
  };
}

/** Rectifies the quad region of `source` into a flat rectangular canvas. */
export function warpPerspective(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const { width, height } = outputSize(quad);
  const srcCtx = source.getContext("2d", { willReadFrequently: true })!;
  const srcData = srcCtx.getImageData(0, 0, source.width, source.height);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d")!;
  const outData = outCtx.createImageData(width, height);

  const dstQuad: Quad = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const h = homography(dstQuad, quad);
  const sw = source.width;
  const sh = source.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const den = h[6]! * x + h[7]! * y + h[8]!;
      const u = (h[0]! * x + h[1]! * y + h[2]!) / den;
      const v = (h[3]! * x + h[4]! * y + h[5]!) / den;
      const sx = Math.min(sw - 1, Math.max(0, Math.round(u)));
      const sy = Math.min(sh - 1, Math.max(0, Math.round(v)));
      const si = (sy * sw + sx) * 4;
      const di = (y * width + x) * 4;
      outData.data[di] = srcData.data[si]!;
      outData.data[di + 1] = srcData.data[si + 1]!;
      outData.data[di + 2] = srcData.data[si + 2]!;
      outData.data[di + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}

function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function applyFilter(source: HTMLCanvasElement, kind: FilterKind): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  if (kind === "color") return out;

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const gray = new Uint8ClampedArray(d.length / 4);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
    gray[p] = g;
    hist[g] = hist[g]! + 1;
  }

  if (kind === "gray") {
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      d[i] = d[i + 1] = d[i + 2] = gray[p]!;
    }
  } else if (kind === "bw") {
    const t = otsuThreshold(hist, gray.length);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = gray[p]! > t * 1.02 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    // enhance: grayscale contrast stretch between the 5th and 95th percentile
    const total = gray.length;
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let i = 0; i < 256; i++) {
      acc += hist[i]!;
      if (acc > total * 0.05) {
        lo = i;
        break;
      }
    }
    acc = 0;
    for (let i = 255; i >= 0; i--) {
      acc += hist[i]!;
      if (acc > total * 0.05) {
        hi = i;
        break;
      }
    }
    const range = Math.max(1, hi - lo);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = Math.min(255, Math.max(0, ((gray[p]! - lo) / range) * 255));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Rough automatic document-edge detection: finds, per image border, the first
 * strong luminance change and returns the resulting quad. Falls back to a
 * small inset when nothing convincing is found.
 */
export function detectQuad(source: HTMLCanvasElement): Quad {
  const w = source.width;
  const h = source.height;
  const inset: Quad = [
    { x: w * 0.06, y: h * 0.06 },
    { x: w * 0.94, y: h * 0.06 },
    { x: w * 0.94, y: h * 0.94 },
    { x: w * 0.06, y: h * 0.94 },
  ];
  try {
    const sw = 160;
    const sh = Math.max(1, Math.round((h / w) * sw));
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext("2d", { willReadFrequently: true })!;
    sctx.drawImage(source, 0, 0, sw, sh);
    const data = sctx.getImageData(0, 0, sw, sh).data;
    const lum = (x: number, y: number) => {
      const i = (y * sw + x) * 4;
      return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    };

    const rowEdge = (y: number, from: "left" | "right") => {
      const step = from === "left" ? 1 : -1;
      const start = from === "left" ? 1 : sw - 2;
      const end = from === "left" ? sw - 1 : 0;
      for (let x = start; x !== end; x += step) {
        if (Math.abs(lum(x, y) - lum(x - step, y)) > 28) return x;
      }
      return from === "left" ? 0 : sw - 1;
    };
    const colEdge = (x: number, from: "top" | "bottom") => {
      const step = from === "top" ? 1 : -1;
      const start = from === "top" ? 1 : sh - 2;
      const end = from === "top" ? sh - 1 : 0;
      for (let y = start; y !== end; y += step) {
        if (Math.abs(lum(x, y) - lum(x, y - step)) > 28) return y;
      }
      return from === "top" ? 0 : sh - 1;
    };

    const mid = Math.round(sh / 2);
    const midX = Math.round(sw / 2);
    const left = rowEdge(mid, "left");
    const right = rowEdge(mid, "right");
    const top = colEdge(midX, "top");
    const bottom = colEdge(midX, "bottom");
    const kx = w / sw;
    const ky = h / sh;
    const x0 = left * kx;
    const x1 = right * kx;
    const y0 = top * ky;
    const y1 = bottom * ky;
    if (x1 - x0 < w * 0.25 || y1 - y0 < h * 0.25) return inset;
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  } catch {
    return inset;
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem"))),
      "image/jpeg",
      quality,
    );
  });
}

export function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const rad = (degrees * Math.PI) / 180;
  const swap = Math.abs(degrees % 180) === 90;
  const out = document.createElement("canvas");
  out.width = swap ? source.height : source.width;
  out.height = swap ? source.width : source.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

export async function loadImageToCanvas(src: string | Blob): Promise<HTMLCanvasElement> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar imagem"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas;
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}
