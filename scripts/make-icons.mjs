// Draws the app icons (indigo square, white ring with a dot) as PNGs, with no image libraries.
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [35, 70, 184];
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const c = size / 2;
  const outer = size * 0.3, inner = size * 0.21, dot = size * 0.075;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges.
      let cover = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const dx = x + (sx + 0.5) / 2 - c, dy = y + (sy + 0.5) / 2 - c;
        const d = Math.hypot(dx, dy);
        const ring = d <= outer && d >= inner;
        const dotHit = Math.hypot(dx - size * 0.0, dy - 0) <= dot;
        if (ring || dotHit) cover++;
      }
      const a = cover / 4;
      const i = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[i + k] = Math.round(BG[k] * (1 - a) + FG[k] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192));
writeFileSync("public/icons/icon-512.png", png(512));
writeFileSync("public/icons/apple-touch-icon.png", png(180));
console.log("Icons written to public/icons");
