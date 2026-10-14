/**
 * 兌換紀錄存在瀏覽器 localStorage，只留在這台裝置。key 是 q（12 位 hex）。
 * 早期版本以五位數代號為 key，由 migrateRedeemed 依清單轉成 q。
 * storage 由外部注入，測試時可傳入假物件。
 */

const KEY_IN_TEXT = /(?<![0-9a-f])(?:\d{5}|[0-9a-f]{12})(?![0-9a-f])/g;
const ID_PATTERN = /^[0-9a-f]{12}$/;

/** 畫面上辨識一筆 QR Code 的短 ID：q 末八碼（刻意不用五碼，避免被當成現場代號）。 */
export function displayLabel(entry) {
  return entry.id.slice(-8);
}

/** 一筆 QR Code 的兌換紀錄 key。 */
export function redeemKey(entry) {
  return entry.id;
}

/** 把早期以代號記的紀錄轉成以 q 記。回傳新物件；沒變動時回傳原物件。 */
export function migrateRedeemed(redeemed, codes) {
  let next = redeemed;
  for (const c of codes) {
    if (!c.code || !redeemed[c.code]) continue;
    if (next === redeemed) next = { ...redeemed };
    next[c.id] ??= redeemed[c.code];
    delete next[c.code];
  }
  return next;
}

/**
 * @param {Storage | undefined} storage
 * @param {string} key
 * @returns {Record<string, string>} q → 標記時間
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

/** 匯出成以空白分隔、排序過的 q 字串。 */
export function exportRedeemed(redeemed) {
  return Object.keys(redeemed)
    .filter((k) => ID_PATTERN.test(k))
    .sort()
    .join(' ');
}

/**
 * 從任意文字擷取 q 併入紀錄，已存在的保留原標記時間。
 * 舊版匯出的五位數代號會依清單換成 q，清單裡找不到的略過。
 * @param {Array<{ id: string, code?: string }>} codes
 * @returns {{ redeemed: Record<string, string>, added: number }}
 */
export function importRedeemed(redeemed, text, codes = [], now = new Date()) {
  const idByCode = new Map(codes.filter((c) => c.code).map((c) => [c.code, c.id]));
  const next = { ...redeemed };
  let added = 0;
  for (const [token] of String(text ?? '').toLowerCase().matchAll(KEY_IN_TEXT)) {
    const id = ID_PATTERN.test(token) ? token : idByCode.get(token);
    if (!id || next[id]) continue;
    next[id] = now.toISOString();
    added++;
  }
  return { redeemed: next, added };
}
