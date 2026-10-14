/**
 * 快速掃描清單的純函式。quick-scan-dev 頁面與 scripts/add-codes.mjs 共用匯出格式。
 * 匯出一行一筆：「代號 網址」，代號未填時寫 -----。
 */
import { CODE_PATTERN, canonicalUrl, parseStarUrl } from './submission.js';

const NO_CODE = '-----';

/**
 * 加入一筆掃描結果，已存在就不動。新的放最前面。
 * @param {Array<{ id: string, code: string, scannedAt: string }>} list
 * @returns {{ list: Array<object>, added: boolean }}
 */
export function addScan(list, id, now = new Date()) {
  if (list.some((s) => s.id === id)) return { list, added: false };
  return { list: [{ id, code: '', scannedAt: now.toISOString() }, ...list], added: true };
}

export function setScanCode(list, id, code) {
  return list.map((s) => (s.id === id ? { ...s, code } : s));
}

export function removeScan(list, id) {
  return list.filter((s) => s.id !== id);
}

/**
 * 匯出需要寫入的：未收錄的，以及已收錄但缺代號、這次有填代號的。
 * @param {Array<{ id: string, code: string }>} list
 * @param {Map<string, string>} known 已收錄的 q → 代號（可能是空字串）
 */
export function toExportText(list, known) {
  return list
    .filter((s) => !known.has(s.id) || (!known.get(s.id) && CODE_PATTERN.test(s.code)))
    .map((s) => `${CODE_PATTERN.test(s.code) ? s.code : NO_CODE} ${canonicalUrl(s.id)}`)
    .join('\n');
}

/**
 * 解析匯出文字。每行找一個星級網址與一個五位數代號，順序不拘；沒有代號就是空字串。
 * @returns {{ entries: Array<{ id: string, url: string, code: string }>, skipped: string[] }}
 */
export function parseExportText(text) {
  const entries = [];
  const skipped = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const urlToken = line.split(/\s+/).find((t) => parseStarUrl(t));
    const id = urlToken ? parseStarUrl(urlToken) : null;
    const code = line.replace(urlToken ?? '', ' ').match(/(?<!\d)\d{5}(?!\d)/)?.[0] ?? '';
    if (id) entries.push({ id, url: canonicalUrl(id), code });
    else skipped.push(line);
  }
  return { entries, skipped };
}
