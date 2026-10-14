// 結構檢查。實際能否被掃描另以 dev-only/qr-verify 用系統解碼器驗證。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignmentPositions, encodeQr, numDataCodewords, qrToPath } from '../assets/qr.js';

// 等級 M 各版本資料碼字數（ISO/IEC 18004 表 7）
const DATA_CODEWORDS_M = { 1: 16, 2: 28, 3: 44, 4: 64, 5: 86, 6: 108, 7: 124, 8: 154, 9: 182, 10: 216, 15: 415, 20: 669 };

test('資料容量與規格表一致', () => {
  for (const [version, expected] of Object.entries(DATA_CODEWORDS_M)) {
    assert.equal(numDataCodewords(Number(version)), expected, `v${version}`);
  }
});

test('校正圖形位置', () => {
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(14), [6, 26, 46, 66]);
});

test('星級網址選用版本 4', () => {
  const qr = encodeQr('https://liff.line.me/2010522144-5nZYW3pn?q=4f1d82f3f089');
  assert.equal(qr.version, 4);
  assert.equal(qr.size, 33);
  assert.equal(qr.modules.length, 33);
});

function readFormat(qr) {
  let bits = 0;
  // 左上角那份格式資訊，依 drawFormatBits 的擺放順序讀回 15 bits
  const coords = [];
  for (let i = 0; i <= 5; i++) coords.push([8, i]);
  coords.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) coords.push([14 - i, 8]);
  coords.forEach(([x, y], i) => {
    if (qr.modules[y][x]) bits |= 1 << i;
  });
  return bits ^ 0x5412;
}

test('格式資訊為等級 M 且與選用遮罩一致', () => {
  for (const text of ['A', 'hello world', 'x'.repeat(200)]) {
    const qr = encodeQr(text);
    const format = readFormat(qr);
    assert.equal(format >>> 13, 0, '等級 M');
    assert.equal((format >>> 10) & 7, qr.mask);
  }
});

test('三個定位圖形', () => {
  const qr = encodeQr('finder');
  const expectFinder = (cx, cy) => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        assert.equal(qr.modules[cy + dy][cx + dx], dist !== 2, `(${cx + dx},${cy + dy})`);
      }
    }
  };
  expectFinder(3, 3);
  expectFinder(qr.size - 4, 3);
  expectFinder(3, qr.size - 4);
});

test('過長資料丟出錯誤', () => {
  assert.throws(() => encodeQr('x'.repeat(700)), RangeError);
});

test('qrToPath 合併同列連續模組並含 quiet zone', () => {
  const qr = encodeQr('A');
  let runs = 0;
  let dark = 0;
  for (const row of qr.modules) {
    row.forEach((m, x) => {
      if (m) dark++;
      if (m && !row[x - 1]) runs++;
    });
  }
  const path = qrToPath(qr);
  const segments = [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)];
  assert.equal(segments.length, runs);
  assert.equal(segments.reduce((sum, m) => sum + Number(m[3]), 0), dark);
  assert.equal(path.slice(0, 4), 'M4 4');
});
