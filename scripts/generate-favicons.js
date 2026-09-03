import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INPUT_SVG = path.join(PUBLIC_DIR, 'favicon.svg');

async function generateFavicons() {
  const svgBuffer = fs.readFileSync(INPUT_SVG);

  // Generate PNG files at common favicon sizes
  const sizes = [16, 32, 48, 180, 192, 512];
  const pngBuffers = {};

  for (const size of sizes) {
    const png = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers[size] = png;
    if (size === 16 || size === 32 || size === 192) {
      const filename = size === 16 ? 'favicon-16x16.png'
                     : size === 32 ? 'favicon-32x32.png'
                     : 'favicon.png';
      fs.writeFileSync(path.join(PUBLIC_DIR, filename), png);
    }
  }

  // Generate favicon.ico containing 16x16 and 32x32
  const icoBuffer = await sharp(pngBuffers[16])
    .resize(16, 16)
    .png()
    .toBuffer();
  const icoBuffer32 = await sharp(pngBuffers[32])
    .resize(32, 32)
    .png()
    .toBuffer();

  // Build ICO file manually (ICO with PNG-encoded images)
  const icoData = buildIco([
    { width: 16, height: 16, data: icoBuffer },
    { width: 32, height: 32, data: icoBuffer32 },
  ]);

  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), Buffer.from(icoData));

  // Also generate apple touch icon
  fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), pngBuffers[180]);

  console.log('Generated: favicon.svg, favicon.ico, favicon-16x16.png, favicon-32x32.png, favicon.png (192x192), apple-touch-icon.png');
}

function buildIco(entries) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // Reserved: 0
  header.writeUInt16LE(1, 2);    // Type: 1 (icon)
  header.writeUInt16LE(entries.length, 4); // Number of images

  // Directory entries: 16 bytes each
  const dirSize = entries.length * 16;
  const dirs = Buffer.alloc(dirSize);
  let offset = 6 + dirSize;

  entries.forEach((entry, i) => {
    const byteWidth = entry.width === 256 ? 0 : entry.width;
    const byteHeight = entry.height === 256 ? 0 : entry.height;
    const size = entry.data.length;

    // Directory entry for this image
    dirs.writeUInt8(byteWidth, i * 16 + 0);      // Width
    dirs.writeUInt8(byteHeight, i * 16 + 1);     // Height
    dirs.writeUInt8(0, i * 16 + 2);              // Color palette (0 = none)
    dirs.writeUInt8(0, i * 16 + 3);              // Reserved
    dirs.writeUInt16LE(1, i * 16 + 4);           // Color planes
    dirs.writeUInt16LE(32, i * 16 + 6);          // Bits per pixel
    dirs.writeUInt32LE(size, i * 16 + 8);        // Size of image data
    dirs.writeUInt32LE(offset, i * 16 + 12);     // Offset of image data

    offset += size;
  });

  // Concatenate all data
  const result = Buffer.concat([header, dirs, ...entries.map(e => e.data)]);
  return result;
}

generateFavicons().catch(err => {
  console.error(err);
  process.exit(1);
});
