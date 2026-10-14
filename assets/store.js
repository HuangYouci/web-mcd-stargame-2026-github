/**
 * 兌換紀錄存在瀏覽器 localStorage，只留在這台裝置。以五位數代號為 key。
 * storage 由外部注入，測試時可傳入假物件。
 */

const CODE_IN_TEXT = /(?<!\d)\d{5}(?!\d)/g;

/**
 * @param {Storage | undefined} storage
 * @param {string} key
 * @returns {Record<string, string>} 代號 → 標記時間
 */
export function loadRedeemed(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn('store.loadRedeemed | 讀取兌換紀錄失敗', error);
    return {};
  }
}

/**
 * @returns {boolean} 是否寫入成功
 */
export function saveRedeemed(storage, key, redeemed) {
  try {
    storage?.setItem(key, JSON.stringify(redeemed));
    return Boolean(storage);
  } catch (error) {
    console.warn('store.saveRedeemed | 寫入兌換紀錄失敗', error);
    return false;
  }
}

/** 回傳切換後的新物件，不修改原物件。 */
export function toggleRedeemed(redeemed, code, now = new Date()) {
  const next = { ...redeemed };
  if (next[code]) delete next[code];
  else next[code] = now.toISOString();
  return next;
}

/** 匯出成以空白分隔、排序過的代號字串。 */
export function exportRedeemed(redeemed) {
  return Object.keys(redeemed).filter((c) => /^\d{5}$/.test(c)).sort().join(' ');
}

/**
 * 從任意文字擷取五位數代號併入紀錄，已存在的保留原標記時間。
 * @returns {{ redeemed: Record<string, string>, added: number }}
 */
export function importRedeemed(redeemed, text, now = new Date()) {
  const next = { ...redeemed };
  let added = 0;
  for (const [code] of String(text ?? '').matchAll(CODE_IN_TEXT)) {
    if (next[code]) continue;
    next[code] = now.toISOString();
    added++;
  }
  return { redeemed: next, added };
}
