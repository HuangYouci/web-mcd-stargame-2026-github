import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addScan, parseExportText, removeScan, setScanCode, toExportText } from '../assets/scan-list.js';

const URL_A = 'https://liff.line.me/2010522144-5nZYW3pn?q=aaaaaaaaaaaa';
const URL_B = 'https://liff.line.me/2010522144-5nZYW3pn?q=bbbbbbbbbbbb';

test('addScan 去重且新的在前', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  let { list, added } = addScan([], 'aaaaaaaaaaaa', now);
  assert.equal(added, true);
  ({ list } = addScan(list, 'bbbbbbbbbbbb', now));
  const again = addScan(list, 'aaaaaaaaaaaa', now);
  assert.equal(again.added, false);
  assert.equal(again.list, list);
  assert.deepEqual(list.map((s) => s.id), ['bbbbbbbbbbbb', 'aaaaaaaaaaaa']);

  list = setScanCode(list, 'aaaaaaaaaaaa', '07029');
  assert.equal(list[1].code, '07029');
  assert.deepEqual(removeScan(list, 'bbbbbbbbbbbb').map((s) => s.id), ['aaaaaaaaaaaa']);
});

test('匯出排除已收錄，未填代號寫 -----，可再解析回來', () => {
  const list = [
    { id: 'aaaaaaaaaaaa', code: '07029' },
    { id: 'bbbbbbbbbbbb', code: '' },
    { id: 'cccccccccccc', code: '11111' },
  ];
  const text = toExportText(list, new Set(['cccccccccccc']));
  assert.equal(text, `07029 ${URL_A}\n----- ${URL_B}`);

  const { entries, skipped } = parseExportText(text);
  assert.deepEqual(entries, [{ id: 'aaaaaaaaaaaa', url: URL_A, code: '07029' }]);
  assert.deepEqual(skipped, [`----- ${URL_B}`]);
});

test('parseExportText 容忍順序、空白與雜訊', () => {
  const { entries, skipped } = parseExportText(`\n  ${URL_B}   12345 \n07680\t${URL_A}\nhello\n`);
  assert.deepEqual(entries.map((e) => e.code), ['12345', '07680']);
  assert.deepEqual(skipped, ['hello']);
});
