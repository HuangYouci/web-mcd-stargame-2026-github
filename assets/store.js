/**
 * 兌換紀錄存在瀏覽器 localStorage，只留在這台裝置。
 * key 有代號用五位數代號，還沒有代號用 q（12 位 hex），補上代號後由 migrateRedeemed 搬過去。
 * storage 由外部注入，測試時可傳入假物件。
 */

const KEY_IN_TEXT = /(?<![0-9a-f])(?:\d{5}|[0-9a-f]{12})(?![0-9a-f])/g;
const KEY_PATTERN = /^(?:\d{5}|[0-9a-f]{12})$/;

/**
 * 畫面上辨識一筆 QR Code 的短標籤：有代號用代號，沒有用 q 末五碼。
 * 末五碼只做顯示，紀錄 key 仍用完整 q，避免剛好是五位數字時和代號撞在一起。
 */
export function displayLabel(entry) {
  return entry.code || entry.id.slice(-5);
}

/** 一筆 QR Code 的兌換紀錄 key。 */
export function redeemKey(entry) {
  return entry.code || entry.id;
}

/** 已有代號的 QR Code，把以 q 記的舊紀錄搬到代號下。回傳新物件；沒變動時回傳原物件。 */
export function migrateRedeemed(redeemed, codes) {
  let next = redeemed;
  for (const c of codes) {
    if (!c.code || !redeemed[c.id]) continue;
    if (next === redeemed) next = { ...redeemed };
    next[c.code] ??= redeemed[c.id];
    delete next[c.id];
  }
  return next;
}

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
export function toggleRedeemed(redeemed, key, now = new Date()) {
  const next = { ...redeemed };
  if (next[key]) delete next[key];
  else next[key] = now.toISOString();
  return next;
}

/** 匯出成以空白分隔、排序過的字串（代號在前，沒代號的 q 在後）。 */
export function exportRedeemed(redeemed) {
  return Object.keys(redeemed)
    .filter((k) => KEY_PATTERN.test(k))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .join(' ');
}

/**
 * 從任意文字擷取五位數代號或 q 併入紀錄，已存在的保留原標記時間。
 * @returns {{ redeemed: Record<string, string>, added: number }}
 */
export function importRedeemed(redeemed, text, now = new Date()) {
  const next = { ...redeemed };
  let added = 0;
  for (const [key] of String(text ?? '').toLowerCase().matchAll(KEY_IN_TEXT)) {
    if (next[key]) continue;
    next[key] = now.toISOString();
    added++;
  }
  return { redeemed: next, added };
}
