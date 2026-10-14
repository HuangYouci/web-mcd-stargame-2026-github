/**
 * 快速掃描清單的純函式。quick-scan-dev 頁面與 scripts/add-codes.mjs 共用匯出格式：一行一個網址。
 */
import { canonicalUrl, parseStarUrl } from './submission.js';

/**
 * 加入一筆掃描結果，已存在就不動。新的放最前面。
 * @param {Array<{ id: string, code: string, scannedAt: string }>} list
 * @returns {{ list: Array<object>, added: boolean }}
 */
export function addScan(list, id, now = new Date()) {
  if (list.some((s) => s.id === id)) return { list, added: false };
  return { list: [{ id, scannedAt: now.toISOString() }, ...list], added: true };
}

export function removeScan(list, id) {
  return list.filter((s) => s.id !== id);
}

/**
 * 匯出未收錄的網址。
 * @param {Array<{ id: string }>} list
 * @param {Set<string>} knownIds 已收錄的 q
 */
export function toExportText(list, knownIds) {
  return list
    .filter((s) => !knownIds.has(s.id))
    .map((s) => canonicalUrl(s.id))
    .join('\n');
}

/**
 * 解析匯出文字：每行找一個星級網址，行內其他文字（例如舊格式的代號）忽略。
 * @returns {{ entries: Array<{ id: string, url: string }>, skipped: string[] }}
 */
export function parseExportText(text) {
  const entries = [];
  const skipped = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const id = line.split(/\s+/).map(parseStarUrl).find(Boolean);
    if (id) entries.push({ id, url: canonicalUrl(id) });
    else skipped.push(line);
  }
  return { entries, skipped };
}
