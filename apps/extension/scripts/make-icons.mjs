// Minimal PNG encoder so the extension ships real icons without a dependency.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
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
function png(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const cx = size / 2;
      const triangle = y > size * 0.22 && y < size * 0.62 && Math.abs(x - cx) < (y - size * 0.22) * 0.9;
      const circle = (x - cx) ** 2 + (y - size * 0.72) ** 2 < (size * 0.2) ** 2;
      const on = triangle || circle;
      raw[i] = 0x58;
      raw[i + 1] = 0xa6;
      raw[i + 2] = 0xff;
      raw[i + 3] = on ? 255 : 0;
    }
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
for (const size of [16, 32, 48, 128]) writeFileSync(resolve(out, `${size}.png`), png(size));
console.log("wrote extension icons");
