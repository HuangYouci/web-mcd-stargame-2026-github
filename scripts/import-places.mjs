// 從星級地圖下載 KML，更新 data/places.json 與 data/summary.json。
// 用法：node scripts/import-places.mjs
import { writeFileSync } from 'node:fs';
import { SITE_CONFIG } from '../assets/config.js';
import { CITIES, parseKml } from './lib/kml.mjs';

const mid = new URL(SITE_CONFIG.mapUrl).searchParams.get('mid');
const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`;

const response = await fetch(kmlUrl);
if (!response.ok) throw new Error(`import-places | 下載 KML 失敗：HTTP ${response.status}`);
const { categories, places } = parseKml(await response.text());
if (places.length === 0) throw new Error('import-places | KML 裡沒有點位，可能是格式變了');

const ids = new Set(places.map((p) => p.id));
if (ids.size !== places.length) throw new Error('import-places | 點位 ID 重複，需改用更長的雜湊');

const unknownCity = places.filter((p) => !p.city);
// 精簡格式減少傳輸量：[ID, 類型索引, 名稱, 縣市索引, 點數, 地址, 地圖搜尋字（同地址時省略）, 備註]
const rows = places.map((p) => {
  const row = [p.id, p.cat, p.name, CITIES.indexOf(p.city), p.points, p.address, p.query === p.address ? '' : p.query, p.note];
  while (row.length > 6 && row[row.length - 1] === '') row.pop();
  return row;
});
const updatedAt = new Date().toISOString().slice(0, 10);
const pointCount = places.reduce((sum, p) => sum + p.points, 0);
const write = (file, data) => writeFileSync(new URL(`../data/${file}`, import.meta.url), JSON.stringify(data) + '\n');
write('places.json', { source: SITE_CONFIG.mapUrl, updatedAt, cities: CITIES, categories, places: rows });
write('summary.json', { updatedAt, placeCount: places.length, pointCount });

console.log(categories.map((c, i) => `${c}: ${places.filter((p) => p.cat === i).length}`).join('\n'));
console.log(`total ${places.length}, points ${pointCount}, 無法判斷縣市 ${unknownCity.length}`);
for (const p of unknownCity.slice(0, 20)) console.log(`  ${p.name} | ${p.address}`);
