#!/usr/bin/env node
'use strict';

/**
 * Generates the small original artwork that ships with Dispatch:
 *   assets/icon.svg                        the logo used in the README
 *   build/icon.png, build/icon.ico         the app and shortcut icon
 * Drawn from code, so the logo needs no image file as a source.
 * Usage: node scripts/make-assets.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const write = (rel, data) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`wrote ${rel} (${data.length} bytes)`);
};

// --- the logo ---------------------------------------------------------------

const D_PATH = 'M30 26H52A24 24 0 0 1 52 74H30ZM42 38H52A12 12 0 0 1 52 62H42Z';
write('assets/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5383b"/><stop offset="1" stop-color="#ff8a5c"/></linearGradient></defs>
<rect width="100" height="100" rx="22" fill="url(#g)"/>
<path fill="#fff" fill-rule="evenodd" d="${D_PATH}"/>
</svg>
`);

function insideLogo(x, y) {
  const r = 22;
  const cx = Math.min(Math.max(x, r), 100 - r);
  const cy = Math.min(Math.max(y, r), 100 - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  const outer = (x >= 30 && x <= 52 && y >= 26 && y <= 74) || (x > 52 && ((x - 52) / 24) ** 2 + ((y - 50) / 24) ** 2 <= 1);
  const inner = (x >= 42 && x <= 52 && y >= 38 && y <= 62) || (x > 52 && ((x - 52) / 12) ** 2 + ((y - 50) / 12) ** 2 <= 1);
  if (outer && !inner) return [255, 255, 255];
  const t = (x + y) / 200;
  return [Math.round(229 + (255 - 229) * t), Math.round(56 + (138 - 56) * t), Math.round(59 + (92 - 59) * t)];
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function logoPng(size) {
  const samples = 3;
  const rows = [];
  for (let py = 0; py < size; py += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const color = insideLogo(((px + (sx + 0.5) / samples) / size) * 100, ((py + (sy + 0.5) / samples) / size) * 100);
          if (color) { r += color[0]; g += color[1]; b += color[2]; a += 1; }
        }
      }
      const total = samples * samples;
      const at = 1 + px * 4;
      row[at] = a ? Math.round(r / a) : 0;
      row[at + 1] = a ? Math.round(g / a) : 0;
      row[at + 2] = a ? Math.round(b / a) : 0;
      row[at + 3] = Math.round((a / total) * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

write('build/icon.png', logoPng(512));
const icon256 = logoPng(256);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header.set([0, 0, 0, 0], 6); // 256x256 is stored as 0
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(icon256.length, 14);
header.writeUInt32LE(22, 18);
write('build/icon.ico', Buffer.concat([header, icon256]));
