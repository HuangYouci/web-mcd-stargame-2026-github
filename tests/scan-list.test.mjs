import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addScan, parseExportText, removeScan, toExportText } from '../assets/scan-list.js';

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
  assert.deepEqual(removeScan(list, 'bbbbbbbbbbbb').map((s) => s.id), ['aaaaaaaaaaaa']);
});

test('匯出未收錄的網址，可再解析回來', () => {
  const list = [{ id: 'aaaaaaaaaaaa' }, { id: 'bbbbbbbbbbbb' }, { id: 'cccccccccccc' }];
  const text = toExportText(list, new Set(['cccccccccccc']));
  assert.equal(text, `${URL_A}\n${URL_B}`);
  assert.deepEqual(parseExportText(text).entries, [
    { id: 'aaaaaaaaaaaa', url: URL_A },
    { id: 'bbbbbbbbbbbb', url: URL_B },
  ]);
});

test('parseExportText 相容舊格式（代號 網址）並略過雜訊', () => {
  const { entries, skipped } = parseExportText(`\n07029 ${URL_A}\n----- ${URL_B}\nhello\n`);
  assert.deepEqual(entries.map((e) => e.id), ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
  assert.deepEqual(skipped, ['hello']);
});
