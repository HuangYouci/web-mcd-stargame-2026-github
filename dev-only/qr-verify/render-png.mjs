// 將 assets/qr.js 的輸出畫成 PNG，交給 decode.swift 用系統 CoreImage 解碼比對。
// 用法：node dev-only/qr-verify/render-png.mjs <輸出目錄>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { encodeQr } from '../../assets/qr.js';

const SCALE = 8;
const BORDER = 4;

const SAMPLES = [
  'https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f089',
  'https://liff.line.me/2010522144-5nZYW3pn?q=757f07e44a21',
  'A',
  '麥當勞星級遊戲',
  'x'.repeat(100),
  'https://example.com/' + 'abcdefghij'.repeat(17),
  'z'.repeat(400),
  'y'.repeat(660),
];

function crc32(buf) {
  let crc = ~0;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(qr) {
  const px = (qr.size + BORDER * 2) * SCALE;
  const rows = [];
  for (let py = 0; py < px; py++) {
    const row = Buffer.alloc(px + 1);
    const y = Math.floor(py / SCALE) - BORDER;
    for (let pxx = 0; pxx < px; pxx++) {
      const x = Math.floor(pxx / SCALE) - BORDER;
      const dark = y >= 0 && y < qr.size && x >= 0 && x < qr.size && qr.modules[y][x];
      row[pxx + 1] = dark ? 0 : 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = process.argv[2];
if (!outDir) throw new Error('render-png | 缺少輸出目錄參數');
mkdirSync(outDir, { recursive: true });
const manifest = SAMPLES.map((text, i) => {
  const qr = encodeQr(text);
  const file = join(outDir, `sample-${i}.png`);
  writeFileSync(file, toPng(qr));
  return { file, text, version: qr.version, mask: qr.mask };
});
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(manifest.map((m) => `v${m.version} mask${m.mask} ${m.file}`).join('\n'));
