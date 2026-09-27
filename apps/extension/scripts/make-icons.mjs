// Rasterise the AskTree brand mark (the SVG in AppHeader.tsx) into PNG icons,
// supersampled for smooth edges. No dependencies: geometry mirrors the brand
// SVG in apps/web/src/components/AppHeader.tsx (24x24 viewBox).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BLUE = [0x58, 0xa6, 0xff];
const BLUE_LIGHT = [0x79, 0xc0, 0xff];

// --- geometry (24x24 viewBox), matching the brand SVG ---
const BRANCHES = [
  [[12, 11.4], [6.9, 15.6]],
  [[12, 11.4], [17.1, 15.6]],
];
const BRANCH_WIDTH = 1.8;
const TRIANGLE = [[12, 2], [9.4, 7.3], [14.6, 7.3]];
const CIRCLES = [
  { c: [12, 8.9], r: 3.3, color: BLUE },
  { c: [6.4, 17.6], r: 2.6, color: BLUE },
  { c: [17.6, 17.6], r: 2.6, color: BLUE_LIGHT },
];

function insideTriangle(x, y) {
  const [[x1, y1], [x2, y2], [x3, y3]] = TRIANGLE;
  const d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2);
  const d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3);
  const d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/** Is the point (in viewBox units) covered by the shape? */
function covered(x, y) {
  if (insideTriangle(x, y)) return BLUE;
  for (const { c, r, color } of CIRCLES) {
    if (Math.hypot(x - c[0], y - c[1]) <= r) return color;
  }
  for (const seg of BRANCHES) {
    if (distToSegment(x, y, seg[0], seg[1]) <= BRANCH_WIDTH / 2) return BLUE;
  }
  return null;
}

/** Supersampled RGBA pixels for a `size`x`size` icon. */
function render(size) {
  const S = 4; // supersample factor
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = ((px + (sx + 0.5) / S) / size) * 24;
          const y = ((py + (sy + 0.5) / S) / size) * 24;
          const color = covered(x, y);
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            hits++;
          }
        }
      }
      const i = (py * size + px) * 4;
      const total = S * S;
      rgba[i] = hits ? Math.round(r / hits) : 0;
      rgba[i + 1] = hits ? Math.round(g / hits) : 0;
      rgba[i + 2] = hits ? Math.round(b / hits) : 0;
      rgba[i + 3] = Math.round((hits / total) * 255);
    }
  }
  return rgba;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function toPng(rgba, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../icons");
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(out, `${size}.png`), toPng(render(size), size));
}
console.log("wrote extension icons (brand mark)");

if (process.argv.includes("--preview")) {
  const size = 32;
  const rgba = render(size);
  let art = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = rgba[(y * size + x) * 4 + 3];
      art += a > 200 ? "#" : a > 90 ? "*" : a > 20 ? "." : " ";
    }
    art += "\n";
  }
  console.log(art);
}
