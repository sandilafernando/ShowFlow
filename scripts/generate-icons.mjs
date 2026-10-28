import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const SOURCE = path.join(BUILD, 'icon-source.svg');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function icoHeader(count) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  return header;
}

function icoEntry({ size, bytes, offset }) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(bytes.length, 8);
  entry.writeUInt32LE(offset, 12);
  return entry;
}

async function buildIco(svg, destination) {
  const images = await Promise.all(
    ICO_SIZES.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()),
  );
  const header = icoHeader(images.length);
  let offset = header.length + images.length * 16;
  const entries = images.map((bytes, index) => {
    const entry = icoEntry({ size: ICO_SIZES[index], bytes, offset });
    offset += bytes.length;
    return entry;
  });
  await writeFile(destination, Buffer.concat([header, ...entries, ...images]));
  return ICO_SIZES;
}

/**
 * Write an uncompressed 24-bit BMP. NSIS accepts classic BMP3 files, which is
 * the safest format for installerHeader / installerSidebar artwork.
 */
async function buildBmp(svg, width, height, destination) {
  const { data } = await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill' })
    .flatten({ background: '#07090b' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const fileSize = 54 + pixelSize;
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(fileSize, 2);
  header.writeUInt32LE(0, 6);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(0, 30);
  header.writeUInt32LE(pixelSize, 34);
  header.writeInt32LE(2835, 38);
  header.writeInt32LE(2835, 42);
  header.writeUInt32LE(0, 46);
  header.writeUInt32LE(0, 50);

  const pixels = Buffer.alloc(pixelSize);
  for (let y = 0; y < height; y += 1) {
    const source = y * width * 3;
    const target = (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x += 1) {
      const from = source + x * 3;
      const to = target + x * 3;
      pixels[to] = data[from + 2];
      pixels[to + 1] = data[from + 1];
      pixels[to + 2] = data[from];
    }
  }

  await writeFile(destination, Buffer.concat([header, pixels]));
}

const headerSvg = `
<svg width="150" height="57" viewBox="0 0 150 57" xmlns="http://www.w3.org/2000/svg">
  <rect width="150" height="57" fill="#07090B"/>
  <rect x="0" y="0" width="150" height="1" fill="#10151B"/>
  <g transform="translate(12 11)">
    <rect width="35" height="35" rx="7" fill="#0B0F13" stroke="#26303A"/>
    <path d="M10 12H24" stroke="#2DD4E6" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 18H21" stroke="#7D8998" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 24H18" stroke="#2DD4E6" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>
    <path d="M27 10V26" stroke="#39434F" stroke-width="1"/>
    <path d="M26 18L28.5 16.6V19.4L26 18Z" fill="#2DD4E6"/>
  </g>
  <text x="55" y="26" fill="#EDF1F6" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="600" letter-spacing="2.1">SHOWFLOW</text>
  <text x="55" y="37" fill="#6B7685" font-family="Segoe UI, Arial, sans-serif" font-size="3.9" font-weight="500" letter-spacing=".55">CUEING &amp; DISPLAY CONTROL</text>
  <rect x="149" y="9" width="1" height="39" fill="#2DD4E6" opacity=".35"/>
</svg>`;

const sidebarSvg = `
<svg width="164" height="314" viewBox="0 0 164 314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="8%" r="65%">
      <stop offset="0" stop-color="#2DD4E6" stop-opacity=".08"/>
      <stop offset="1" stop-color="#2DD4E6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="#07090B"/>
  <rect width="164" height="314" fill="url(#glow)"/>
  <g opacity=".5" stroke="#111820">
    <path d="M0 52.5H164M0 104.5H164M0 156.5H164M0 208.5H164M0 260.5H164"/>
    <path d="M41.5 0V314M82.5 0V314M123.5 0V314"/>
  </g>
  <rect x="0" y="0" width="3" height="314" fill="#2DD4E6" opacity=".75"/>
  <g transform="translate(50 42)">
    <rect width="64" height="64" rx="13" fill="#0B0F13" stroke="#26303A"/>
    <path d="M17 22H41" stroke="#2DD4E6" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M17 32H36" stroke="#7D8998" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M17 42H31" stroke="#2DD4E6" stroke-width="3.6" stroke-linecap="round" opacity=".5"/>
    <path d="M47 19V45" stroke="#39434F" stroke-width="1.2"/>
    <path d="M45.5 32L49 30V34L45.5 32Z" fill="#2DD4E6"/>
    <circle cx="47" cy="19" r="1.6" fill="#7CECF7"/>
  </g>
  <text x="24" y="150" fill="#EDF1F6" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="3.2">SHOWFLOW</text>
  <text x="24" y="167" fill="#6B7685" font-family="Segoe UI, Arial, sans-serif" font-size="5.8" font-weight="500" letter-spacing="1.45">LIVE PRODUCTION CONTROL</text>
  <rect x="24" y="182" width="28" height="1" fill="#2DD4E6" opacity=".6"/>
  <text x="24" y="196" fill="#9AA5B4" font-family="Segoe UI, Arial, sans-serif" font-size="6.2" font-weight="500" letter-spacing="1.1">EDUCATIONAL MEDIA UNIT</text>
  <text x="24" y="207" fill="#555F6C" font-family="Segoe UI, Arial, sans-serif" font-size="5.4" letter-spacing=".7">MARIS STELLA COLLEGE</text>
  <g transform="translate(24 244)">
    <path d="M0 0H92" stroke="#26303A"/>
    <path d="M0 0V22" stroke="#26303A"/>
    <path d="M92 0V22" stroke="#26303A"/>
    <path d="M38 22V40" stroke="#2DD4E6" stroke-width="1.4"/>
    <path d="M33 41L38 37.5L43 41L38 44.5Z" fill="#2DD4E6"/>
  </g>
  <text x="24" y="298" fill="#434D59" font-family="Segoe UI, Arial, sans-serif" font-size="5" letter-spacing="1">OFFLINE · LOCAL · DELIBERATE</text>
</svg>`;

await mkdir(BUILD, { recursive: true });
const svg = await readFile(SOURCE);

await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(path.join(BUILD, 'icon.png'));
const icoSizes = await buildIco(svg, path.join(BUILD, 'icon.ico'));
await buildBmp(headerSvg, 150, 57, path.join(BUILD, 'installerHeader.bmp'));
await buildBmp(sidebarSvg, 164, 314, path.join(BUILD, 'installerSidebar.bmp'));

const png = await sharp(path.join(BUILD, 'icon.png')).metadata();
const ico = await readFile(path.join(BUILD, 'icon.ico'));
console.log(`icon.png        512x512 (${png.format}, ${png.channels} channels)`);
console.log(`icon.ico        ${icoSizes.join(', ')} px (${ico.length} bytes)`);
console.log('installerHeader.bmp  150x57, 24-bit');
console.log('installerSidebar.bmp 164x314, 24-bit');
