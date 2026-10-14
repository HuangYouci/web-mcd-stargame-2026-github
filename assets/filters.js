import { redeemKey } from './store.js';

/** 清單篩選與排序，純函式。 */

function includesText(fields, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
}

/**
 * @param {Array<{ id: string, code: string }>} codes
 * @param {{ query: string, status: 'all' | 'todo' | 'done' }} filter
 * @param {Record<string, string>} redeemed
 */
export function filterCodes(codes, filter, redeemed) {
  return codes
    .filter((c) => {
      const done = Boolean(redeemed[redeemKey(c)]);
      if (filter.status === 'todo' && done) return false;
      if (filter.status === 'done' && !done) return false;
      return includesText([c.code, c.id], filter.query);
    })
    .sort((a, b) => {
      // 沒有代號的排最後
      if (!a.code !== !b.code) return a.code ? -1 : 1;
      return a.code.localeCompare(b.code) || a.id.localeCompare(b.id);
    });
}

/**
 * @param {Array<{ cat: number, city: string, name: string, address: string, note: string }>} places
 * @param {{ query: string, cat: string, city: string }} filter cat 與 city 空字串代表全部
 */
export function filterPlaces(places, filter) {
  return places.filter((p) => {
    if (filter.cat !== '' && p.cat !== Number(filter.cat)) return false;
    if (filter.city !== '' && p.city !== filter.city) return false;
    return includesText([p.name, p.address, p.note], filter.query);
  });
}

export function mapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
