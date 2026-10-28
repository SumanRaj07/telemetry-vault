// Generates assets/icon.png (256x256, light-green rounded square with a
// white pulse/telemetry mark) and assets/icon.ico (PNG wrapped in ICO format,
// which Windows Vista+ accepts). No external dependencies: pure node:zlib.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(dir, { recursive: true });

const SIZE = 256;
const BG = [101, 168, 120, 255]; // #65A878
const DEEP = [40, 104, 68, 255]; // #286844
const WHITE = [255, 255, 255, 255];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Rounded-rect mask + a simple telemetry pulse polyline.
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const R = 56;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = Math.max(R - x, 0, x - (SIZE - 1 - R));
    const dy = Math.max(R - y, 0, y - (SIZE - 1 - R));
    const inside = dx * dx + dy * dy <= R * R;
    const idx = (y * SIZE + x) * 4;
    const col = inside ? BG : [0, 0, 0, 0];
    pixels[idx] = col[0]; pixels[idx + 1] = col[1]; pixels[idx + 2] = col[2]; pixels[idx + 3] = col[3];
  }
}
// Pulse line: points across the middle, drawn thick in white with a deep-green
// dot at the peak.
const pts = [[28, 150], [70, 150], [95, 150], [115, 90], [135, 170], [155, 150], [190, 150], [228, 150]];
function drawLine(x0, y0, x1, y1, color, width) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    for (let ox = -width; ox <= width; ox++) {
      for (let oy = -width; oy <= width; oy++) {
        const px = x + ox, py = y + oy;
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) continue;
        const idx = (py * SIZE + px) * 4;
        pixels[idx] = color[0]; pixels[idx + 1] = color[1]; pixels[idx + 2] = color[2]; pixels[idx + 3] = 255;
      }
    }
  }
}
for (let i = 0; i < pts.length - 1; i++) drawLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], WHITE, 3);
// Deep-green dot at the pulse peak.
for (let ox = -9; ox <= 9; ox++) {
  for (let oy = -9; oy <= 9; oy++) {
    if (ox * ox + oy * oy > 81) continue;
    const px = 115 + ox, py = 90 + oy;
    const idx = (py * SIZE + px) * 4;
    pixels[idx] = DEEP[0]; pixels[idx + 1] = DEEP[1]; pixels[idx + 2] = DEEP[2]; pixels[idx + 3] = 255;
  }
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(path.join(dir, 'icon.png'), png);

// ICO: header + one entry pointing at the embedded PNG.
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // 0 means 256
entry[1] = 0;
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12);
writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([icoHeader, entry, png]));
console.log(`Wrote ${path.join(dir, 'icon.png')} (${png.length} bytes) and icon.ico`);
