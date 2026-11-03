// Makes the app icons in public/icons/ from design/logo/plasticash-mark.svg (the logo only, no text).
// Run after the logo changes:  node scripts/make-icons.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const logo = path.join(here, "..", "..", "design", "logo", "plasticash-mark.svg");
const out = path.join(here, "..", "public", "icons");
const GREEN = "#15803D"; // the mark's own background, so padding blends in

const svg = await readFile(logo);
await mkdir(out, { recursive: true });

// The mark as a square PNG (transparent outside its rounded corners).
const mark = (size) => sharp(svg, { density: Math.ceil((72 * size) / 64) * 2 }).resize(size, size).png().toBuffer();

// The mark centred on a full green square: for iOS (no transparency; iOS rounds the corners itself) and for
// maskable icons, where the platform crops to a circle or squircle inside the middle 80%.
async function onGreen(size, markShare) {
  const inner = Math.round(size * markShare);
  return sharp({ create: { width: size, height: size, channels: 4, background: GREEN } })
    .composite([{ input: await mark(inner), gravity: "center" }])
    .png()
    .toBuffer();
}

// favicon.ico: an ICO container holding PNG images (supported by every current browser).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const files = {
  "icon-192.png": await mark(192),
  "icon-512.png": await mark(512),
  // Logo inside the maskable safe zone (a circle of 80% of the width): 62% leaves the glyph well inside it.
  "maskable-512.png": await onGreen(512, 0.62),
  "apple-touch-icon.png": await onGreen(180, 0.86),
  "favicon.ico": ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await mark(size) })))),
};

for (const [name, data] of Object.entries(files)) {
  await writeFile(path.join(out, name), data);
  console.log(`public/icons/${name}  ${data.length} bytes`);
}
