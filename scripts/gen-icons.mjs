/**
 * Generates minimal valid PNG icons for the PWA manifest.
 * No external dependencies — uses a hand-rolled PNG encoder.
 */
import { createWriteStream } from "fs";
import { deflateSync } from "zlib";

/** Encode a 32-bit big-endian integer into a Buffer */
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n, 0);
  return b;
}

/** CRC-32 table */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = u32(data.length);
  const crcBuf = u32(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Draw the DocScan icon onto an RGBA pixel buffer of size×size.
 * Uses a simple dark background + white document + green scan corners.
 */
function drawIcon(size) {
  const pixels = new Uint8ClampedArray(size * size * 4);

  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  };

  const fillRect = (x0, y0, w, h, r, g, b, a = 255) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) set(x0 + dx, y0 + dy, r, g, b, a);
  };

  const s = (v) => Math.round((v / 512) * size); // scale from 512-coord-space

  // Background: #1a1a1a with rounded-corner mask
  const radius = s(112);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // simple rounded-rect check
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      if (cx < radius && cy < radius) {
        const dx = radius - cx;
        const dy = radius - cy;
        if (dx * dx + dy * dy > radius * radius) continue;
      }
      set(x, y, 26, 26, 26);
    }
  }

  // Document body (white card)
  fillRect(s(152), s(122), s(328) - s(152), s(358) - s(122), 245, 245, 245);

  // Fold corner (top-right)
  const foldX = s(296);
  const foldY = s(122);
  const foldW = s(328) - s(296);
  const foldH = s(154) - s(122);
  for (let dy = 0; dy < foldH; dy++) {
    for (let dx = 0; dx < foldW; dx++) {
      if (dx / foldW + dy / foldH < 1) {
        set(foldX + dx, foldY + dy, 210, 210, 210);
      }
    }
  }

  // Document lines
  fillRect(s(172), s(180), s(308) - s(172), s(8), 180, 180, 180);
  fillRect(s(172), s(204), s(282) - s(172), s(8), 180, 180, 180);
  fillRect(s(172), s(228), s(292) - s(172), s(8), 180, 180, 180);
  fillRect(s(172), s(252), s(262) - s(172), s(8), 180, 180, 180);

  // Scan corners (green #4ade80 = 74,222,128)
  const thick = Math.max(2, s(14));
  const arm = s(36);

  // top-left of viewfinder bracket: (254,320) horizontal then (254,356) vertical
  const bx = s(254);
  const by = s(320);
  // horizontal arm going right
  fillRect(bx, by, s(290) - bx, thick, 74, 222, 128);
  // vertical arm going down
  fillRect(bx, by, thick, s(356) - by, 74, 222, 128);

  // bottom-right of viewfinder bracket: (326,392) horizontal then (326,356) vertical
  const cx2 = s(290);
  const cy2 = s(356);
  // horizontal arm going right
  fillRect(cx2, s(392), s(326) - cx2, thick, 74, 222, 128);
  // vertical arm going up
  fillRect(s(326) - thick, cy2, thick, s(392) - cy2, 74, 222, 128);

  return pixels;
}

function encodePng(size) {
  const pixels = drawIcon(size);

  // Build raw image data: each row prefixed with filter byte 0 (None)
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
      const di = y * (1 + size * 4) + 1 + x * 4;
      raw[di] = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }
  const compressed = deflateSync(raw, { level: 6 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);   // width
  ihdr.writeUInt32BE(size, 4);   // height
  ihdr[8] = 8;                   // bit depth
  ihdr[9] = 6;                   // color type RGBA
  ihdr[10] = 0;                  // compression
  ihdr[11] = 0;                  // filter
  ihdr[12] = 0;                  // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [192, 512];
for (const size of sizes) {
  const buf = encodePng(size);
  const path = `public/icons/icon-${size}.png`;
  const ws = createWriteStream(path);
  ws.write(buf);
  ws.end();
  console.log(`Generated ${path} (${buf.length} bytes)`);
}
