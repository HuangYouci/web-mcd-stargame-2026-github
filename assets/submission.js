/**
 * 投稿驗證與收錄邏輯。網站投稿表單與 GitHub Action 共用同一份規則。
 */
import { SITE_CONFIG } from './config.js';

const ID_PATTERN = /^[0-9a-f]{12}$/;
export const CODE_PATTERN = /^\d{5}$/;

/** 統一成 LIFF 標準網址。 */
export function canonicalUrl(id) {
  return `https://liff.line.me/${SITE_CONFIG.liffId}?q=${id}`;
}

/**
 * 從星級遊戲網址取出 q 參數。不是星級遊戲網址時回傳 null。
 * @param {string} input
 * @returns {string | null}
 */
export function parseStarUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'liff.line.me') return null;
  if (url.pathname.replace(/\/$/, '') !== `/${SITE_CONFIG.liffId}`) return null;
  const id = (url.searchParams.get('q') ?? '').toLowerCase();
  return ID_PATTERN.test(id) ? id : null;
}

/**
 * 驗證投稿內容。
 * @param {{ url?: string, code?: string }} input
 * @returns {{ ok: true, value: { id: string, url: string, code: string } } | { ok: false, errors: string[] }}
 */
export function validateSubmission(input) {
  const errors = [];
  const id = parseStarUrl(input.url);
  if (!id) errors.push('網址不是星級遊戲的 QR Code');

  // 代號可留空，之後再補
  const code = String(input.code ?? '').trim();
  if (code && !CODE_PATTERN.test(code)) errors.push('代號要是 5 位數字');

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { id, url: canonicalUrl(id), code } };
}

/**
 * 把投稿併入清單。
 * - added：新的 QR Code（代號可空）
 * - updated：已收錄但沒代號，補上代號
 * - duplicate：同一個 QR Code 已收錄
 * - conflict：代號已對應另一個 QR Code，需人工確認
 * @param {Array<{ id: string, code: string }>} codes 現有清單（不會被修改）
 * @param {{ id: string, url: string, code: string }} entry 已驗證的投稿
 * @param {{ addedAt: string, source: string }} meta
 * @returns {{ status: 'added' | 'updated' | 'duplicate' | 'conflict', codes: Array<object>, existing?: object }}
 */
export function mergeCode(codes, entry, meta) {
  const sameCode = entry.code ? codes.find((c) => c.code === entry.code && c.id !== entry.id) : null;
  if (sameCode) return { status: 'conflict', codes, existing: sameCode };

  const index = codes.findIndex((c) => c.id === entry.id);
  if (index !== -1) {
    const existing = codes[index];
    if (existing.code || !entry.code) return { status: 'duplicate', codes, existing };
    const next = [...codes];
    next[index] = { ...existing, code: entry.code };
    return { status: 'updated', codes: next, existing };
  }

  const added = { id: entry.id, code: entry.code, url: entry.url, addedAt: meta.addedAt, source: meta.source };
  return { status: 'added', codes: [...codes, added] };
}

/**
 * 產生預先填好的 GitHub Issue 投稿網址。
 * @param {{ url: string, code: string }} value
 */
export function buildIssueUrl(value) {
  const params = new URLSearchParams({
    template: SITE_CONFIG.issueTemplate,
    title: `投稿：${value.code || value.url.split('q=')[1]}`,
    url: value.url,
  });
  if (value.code) params.set('code', value.code);
  return `https://github.com/${SITE_CONFIG.repoOwner}/${SITE_CONFIG.repoName}/issues/new?${params}`;
}
