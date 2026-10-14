// 把 quick-scan-dev 複製出來的網址併入 data/codes.json，只以 q 判斷重複。
// 用法：node scripts/add-codes.mjs <文字檔>，或從 stdin 貼上。
import { readFileSync, writeFileSync } from 'node:fs';
import { parseExportText } from '../assets/scan-list.js';
import { mergeCode } from '../assets/submission.js';

const CODES_PATH = new URL('../data/codes.json', import.meta.url);
const input = readFileSync(process.argv[2] ?? 0, 'utf8');
const { entries, skipped } = parseExportText(input);

let codes = JSON.parse(readFileSync(CODES_PATH, 'utf8'));
const addedAt = new Date().toISOString().slice(0, 10);
const report = { added: [], duplicate: [] };
for (const entry of entries) {
  const merged = mergeCode(codes, entry, { addedAt, source: 'quick-scan' });
  codes = merged.codes;
  report[merged.status].push(entry.id);
}
writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2) + '\n');

console.log(`新增 ${report.added.length}：${report.added.join(' ')}`);
console.log(`已存在 ${report.duplicate.length}：${report.duplicate.join(' ')}`);
console.log(`無法解析 ${skipped.length}`);
for (const line of skipped) console.log(`  ${line}`);
