/**
 * 解析星級地圖（Google My Maps）匯出的 KML，轉成點位清單。
 * 該地圖只有地址沒有座標，因此不處理 Point。
 */

// 由北到南，也是網站篩選選單的順序
export const CITIES = [
  '基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣',
  '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣',
  '金門縣', '連江縣',
];

// 地址省略縣名時，以縣轄市鄉鎮推回所屬縣市
const TOWN_TO_CITY = {
  宜蘭市: '宜蘭縣', 羅東鎮: '宜蘭縣', 竹北市: '新竹縣', 苗栗市: '苗栗縣', 頭份市: '苗栗縣',
  彰化市: '彰化縣', 員林市: '彰化縣', 南投市: '南投縣', 斗六市: '雲林縣', 太保市: '嘉義縣',
  朴子市: '嘉義縣', 屏東市: '屏東縣', 花蓮市: '花蓮縣', 台東市: '台東縣', 馬公市: '澎湖縣',
  金城鎮: '金門縣',
};

// 郵遞區號前三碼範圍，地址沒寫縣市時使用
const POSTAL_RANGES = [
  [100, 116, '台北市'], [200, 206, '基隆市'], [207, 208, '新北市'], [209, 212, '連江縣'],
  [220, 253, '新北市'], [260, 272, '宜蘭縣'], [300, 300, '新竹市'], [302, 315, '新竹縣'],
  [320, 338, '桃園市'], [350, 369, '苗栗縣'], [400, 439, '台中市'], [500, 530, '彰化縣'],
  [540, 558, '南投縣'], [600, 600, '嘉義市'], [602, 625, '嘉義縣'], [630, 655, '雲林縣'],
  [700, 745, '台南市'], [800, 852, '高雄市'], [880, 885, '澎湖縣'], [890, 896, '金門縣'],
  [900, 947, '屏東縣'], [950, 966, '台東縣'], [970, 983, '花蓮縣'],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(raw) {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = cdata ? cdata[1] : raw;
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function firstTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXml(match[1]) : '';
}

/** 從地址判斷縣市；判斷不出來回傳空字串。 */
export function cityOf(address) {
  const normalized = address.replace(/臺/g, '台').replace(/巿/g, '市');
  let best = '';
  let bestIndex = Infinity;
  for (const city of CITIES) {
    const i = normalized.indexOf(city);
    if (i !== -1 && i < bestIndex) {
      best = city;
      bestIndex = i;
    }
  }
  if (best) return best;
  for (const [town, city] of Object.entries(TOWN_TO_CITY)) {
    if (normalized.includes(town)) return city;
  }
  const postal = normalized.match(/^\s*(\d{3})/);
  if (postal) {
    const code = Number(postal[1]);
    const range = POSTAL_RANGES.find(([from, to]) => code >= from && code <= to);
    if (range) return range[2];
  }
  return '';
}

/**
 * 名稱統一成「類型 - 名稱」。原始資料分隔符號寬窄不一，也有少數沒寫類型。
 * 例：「麥當勞-員林大道餐廳」→「麥當勞 - 員林大道餐廳」。
 */
export function normalizeName(name, category) {
  const match = name.match(/^(.+?)\s*-\s*(.+)$/);
  if (match) {
    const prefix = match[1].trim();
    if (category.startsWith(prefix) || prefix.startsWith(category)) return `${prefix} - ${match[2].trim()}`;
  }
  return `${category} - ${name.trim()}`;
}

/** 名稱裡「（共 N 點）」的點數，沒寫就是 1。 */
export function pointsOf(name) {
  const match = name.match(/共\s*(\d+)\s*點/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

/** 由類型、原始名稱、地址算出穩定的 7 碼點位 ID（FNV-1a 32 位元轉 36 進位）。 */
export function placeIdOf(category, rawName, address) {
  let hash = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(`${category}|${rawName}|${address}`)) {
    hash ^= ch;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

/**
 * @param {string} kml
 * @returns {{ categories: string[], places: Array<{ id: string, cat: number, name: string, city: string, points: number, address: string, query: string, note: string }> }}
 */
export function parseKml(kml) {
  const categories = [];
  const places = [];
  for (const folder of kml.matchAll(/<Folder>([\s\S]*?)<\/Folder>/g)) {
    const body = folder[1];
    const category = firstTag(body.split('<Placemark>')[0], 'name');
    const cat = categories.push(category) - 1;
    for (const placemark of body.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const pm = placemark[1];
      const data = {};
      for (const d of pm.matchAll(/<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>/g)) {
        data[decodeXml(d[1]).replace(/\s+/g, '')] = decodeXml(d[2]);
      }
      const rawName = firstTag(pm, 'name');
      const address = data['地址'] || firstTag(pm, 'address');
      places.push({
        id: placeIdOf(category, rawName, address),
        cat,
        name: normalizeName(rawName, category),
        city: cityOf(address),
        points: pointsOf(rawName),
        address,
        query: data['GoogleMaps搜尋'] || address,
        note: data['備註'] || '',
      });
    }
  }
  return { categories, places };
}
