/**
 * 投稿、回報的驗證與收錄邏輯。網站與 GitHub Action 共用同一份規則。
 * 只以網址的 q 判斷是否重複；資料保留 code 欄位，但不再收集代號。
 */
import { SITE_CONFIG } from './config.js';

const ID_PATTERN = /^[0-9a-f]{12}$/;

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
 * @param {{ url?: string }} input
 * @returns {{ ok: true, value: { id: string, url: string } } | { ok: false, errors: string[] }}
 */
export function validateSubmission(input) {
  const id = parseStarUrl(input.url);
  if (!id) return { ok: false, errors: ['網址不是星級遊戲的 QR Code'] };
  return { ok: true, value: { id, url: canonicalUrl(id) } };
}

/**
 * 把投稿併入清單，只以 q 判斷重複。
 * @param {Array<{ id: string }>} codes 現有清單（不會被修改）
 * @param {{ id: string, url: string }} entry 已驗證的投稿
 * @param {{ addedAt: string, source: string }} meta
 * @returns {{ status: 'added' | 'duplicate', codes: Array<object>, existing?: object }}
 */
export function mergeCode(codes, entry, meta) {
  const existing = codes.find((c) => c.id === entry.id);
  if (existing) return { status: 'duplicate', codes, existing };
  const added = { id: entry.id, code: '', url: entry.url, addedAt: meta.addedAt, source: meta.source };
  return { status: 'added', codes: [...codes, added] };
}

/**
 * 記錄一筆「無法使用」回報。同一個帳號只算一次。
 * @param {Array<{ id: string, reports?: string[] }>} codes 現有清單（不會被修改）
 * @returns {{ status: 'reported' | 'already' | 'unknown', codes: Array<object>, count: number }}
 */
export function addReport(codes, id, reporter) {
  const index = codes.findIndex((c) => c.id === id);
  if (index === -1) return { status: 'unknown', codes, count: 0 };
  const reports = codes[index].reports ?? [];
  if (reports.includes(reporter)) return { status: 'already', codes, count: reports.length };
  const next = [...codes];
  next[index] = { ...codes[index], reports: [...reports, reporter] };
  return { status: 'reported', codes: next, count: reports.length + 1 };
}

function issueUrl(template, title, url) {
  const params = new URLSearchParams({ template, title, url });
  return `https://github.com/${SITE_CONFIG.repoOwner}/${SITE_CONFIG.repoName}/issues/new?${params}`;
}

/** 預先填好的投稿 Issue 網址。 */
export function buildIssueUrl(url) {
  return issueUrl(SITE_CONFIG.issueTemplate, `投稿：${url.slice(-5)}`, url);
}

/** 預先填好的「無法使用」回報 Issue 網址。 */
export function buildReportUrl(url) {
  return issueUrl(SITE_CONFIG.reportTemplate, `回報無法使用：${url.slice(-5)}`, url);
}
