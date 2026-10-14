import { redeemKey } from './store.js';

/** 清單篩選與排序，純函式。 */

function includesText(fields, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
}

/**
 * 排序：沒人回報的在前，各自依收錄日新到舊。
 * @param {Array<{ id: string, addedAt: string, reports?: string[] }>} codes
 * @param {{ query: string, status: 'all' | 'todo' | 'done' }} filter
 * @param {Record<string, string>} redeemed
 */
export function filterCodes(codes, filter, redeemed) {
  return codes
    .filter((c) => {
      const done = Boolean(redeemed[redeemKey(c)]);
      if (filter.status === 'todo' && done) return false;
      if (filter.status === 'done' && !done) return false;
      return includesText([c.id], filter.query);
    })
    .sort((a, b) => {
      const ra = a.reports?.length ? 1 : 0;
      const rb = b.reports?.length ? 1 : 0;
      return ra - rb || String(b.addedAt).localeCompare(String(a.addedAt)) || a.id.localeCompare(b.id);
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
