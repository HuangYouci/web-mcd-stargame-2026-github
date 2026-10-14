import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { filterCodes, filterPlaces } from '../assets/filters.js';
import { decodePlaces } from '../assets/places.js';
import { exportRedeemed, importRedeemed, loadRedeemed, migrateRedeemed, redeemKey, saveRedeemed, toggleRedeemed } from '../assets/store.js';
import { cityOf, normalizeName, parseKml, placeIdOf, pointsOf } from '../scripts/lib/kml.mjs';

test('cityOf 處理異體字、省略縣名與郵遞區號', () => {
  assert.equal(cityOf('103 台北市大同區市民大道一段209號5樓'), '台北市');
  assert.equal(cityOf('104 台北巿中山區南京西路14號'), '台北市');
  assert.equal(cityOf('臺中市西屯區'), '台中市');
  assert.equal(cityOf('260 宜蘭市民權路二段'), '宜蘭縣');
  assert.equal(cityOf('551 名間鄉仁和村彰南路256號'), '南投縣');
  assert.equal(cityOf('新竹縣竹北市光明六路'), '新竹縣');
  assert.equal(cityOf('不明地址'), '');
});

test('normalizeName 統一成「類型 - 名稱」', () => {
  assert.equal(normalizeName('麥當勞 - 昆明餐廳', '麥當勞餐廳'), '麥當勞 - 昆明餐廳');
  assert.equal(normalizeName('麥當勞-員林大道餐廳', '麥當勞餐廳'), '麥當勞 - 員林大道餐廳');
  assert.equal(normalizeName('統一販賣機 - 台灣高鐵-總公司', '統一販賣機'), '統一販賣機 - 台灣高鐵-總公司');
  assert.equal(normalizeName('台灣高鐵-總公司', '統一販賣機'), '統一販賣機 - 台灣高鐵-總公司');
});

test('pointsOf 與 placeIdOf', () => {
  assert.equal(pointsOf('統一販賣機 - 台灣大學宿舍（共4點）'), 4);
  assert.equal(pointsOf('麥當勞 - 昆明餐廳'), 1);
  const id = placeIdOf('嘟嘟房', '嘟嘟房 - A', '地址');
  assert.match(id, /^[0-9a-z]{7}$/);
  assert.equal(placeIdOf('嘟嘟房', '嘟嘟房 - A', '地址'), id, '同輸入同 ID');
  assert.notEqual(placeIdOf('嘟嘟房', '嘟嘟房 - B', '地址'), id);
});

test('parseKml 讀出分類、名稱與欄位', () => {
  const kml = `<kml><Document><Folder><name>嘟嘟房</name>
    <Placemark><name>嘟嘟房 - A &amp; B 站（共2點）</name><address>112 台北市北投區</address>
      <ExtendedData><Data name="Google Maps 搜尋"><value>嘟嘟房停車場-A</value></Data>
      <Data name="地址"><value>112 台北市北投區七星街3號</value></Data>
      <Data name="備註"><value><![CDATA[B1]]></value></Data></ExtendedData></Placemark>
  </Folder></Document></kml>`;
  assert.deepEqual(parseKml(kml), {
    categories: ['嘟嘟房'],
    places: [
      {
        id: placeIdOf('嘟嘟房', '嘟嘟房 - A & B 站（共2點）', '112 台北市北投區七星街3號'),
        cat: 0,
        name: '嘟嘟房 - A & B 站（共2點）',
        city: '台北市',
        points: 2,
        address: '112 台北市北投區七星街3號',
        query: '嘟嘟房停車場-A',
        note: 'B1',
      },
    ],
  });
});

test('places.json 每個點位都有縣市', async () => {
  const data = decodePlaces(JSON.parse(await readFile(new URL('../data/places.json', import.meta.url), 'utf8')));
  assert.ok(data.places.length > 0);
  for (const p of data.places) {
    assert.ok(data.cities.includes(p.city), `${p.name} ${p.address}`);
    assert.ok(data.categories[p.cat], p.name);
    assert.ok(p.query, p.name);
    assert.ok(p.points >= 1, p.name);
  }
  assert.equal(new Set(data.places.map((p) => p.id)).size, data.places.length, '點位 ID 不重複');
  const summary = JSON.parse(await readFile(new URL('../data/summary.json', import.meta.url), 'utf8'));
  assert.equal(summary.placeCount, data.places.length);
  assert.equal(summary.pointCount, data.places.reduce((sum, p) => sum + p.points, 0));
});

test('filterCodes 以 q 查兌換紀錄；被回報的排最後，其餘新到舊', () => {
  const codes = [
    { id: 'aaaaaaaaaaaa', addedAt: '2026-10-13' },
    { id: 'bbbbbbbbbbbb', addedAt: '2026-10-14' },
    { id: 'cccccccccccc', addedAt: '2026-10-15', reports: ['x'] },
  ];
  const redeemed = { bbbbbbbbbbbb: 't' };
  const ids = (list) => list.map((c) => c.id[0]);
  assert.deepEqual(ids(filterCodes(codes, { query: '', status: 'all' }, redeemed)), ['b', 'a', 'c']);
  assert.deepEqual(ids(filterCodes(codes, { query: '', status: 'todo' }, redeemed)), ['a', 'c']);
  assert.deepEqual(ids(filterCodes(codes, { query: '', status: 'done' }, redeemed)), ['b']);
  assert.deepEqual(ids(filterCodes(codes, { query: 'cccc', status: 'all' }, redeemed)), ['c']);
});

test('migrateRedeemed：早期以代號記的紀錄轉成 q', () => {
  const before = { '07029': 't1', bbbbbbbbbbbb: 't2' };
  const codes = [{ id: 'aaaaaaaaaaaa', code: '07029' }, { id: 'bbbbbbbbbbbb', code: '07680' }];
  assert.deepEqual(migrateRedeemed(before, codes), { aaaaaaaaaaaa: 't1', bbbbbbbbbbbb: 't2' });
  assert.equal(before['07029'], 't1', '不修改原物件');
  const untouched = { x: 1 };
  assert.equal(migrateRedeemed(untouched, codes), untouched);
  assert.equal(redeemKey({ id: 'aaaaaaaaaaaa', code: '07029' }), 'aaaaaaaaaaaa');
});

test('filterPlaces 類別 0 不被當成全部', () => {
  const places = [
    { cat: 0, city: '台北市', name: 'A', address: '', note: '' },
    { cat: 1, city: '台中市', name: 'B', address: '', note: '' },
  ];
  assert.deepEqual(filterPlaces(places, { query: '', cat: '0', city: '' }).map((p) => p.name), ['A']);
  assert.deepEqual(filterPlaces(places, { query: '', cat: '', city: '台中市' }).map((p) => p.name), ['B']);
});

test('兌換紀錄讀寫與壞資料', () => {
  const memory = new Map();
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const now = new Date('2026-10-14T00:00:00Z');
  const once = toggleRedeemed({}, '07029', now);
  assert.deepEqual(once, { '07029': '2026-10-14T00:00:00.000Z' });
  assert.equal(saveRedeemed(storage, 'k', once), true);
  assert.deepEqual(loadRedeemed(storage, 'k'), once);
  assert.deepEqual(toggleRedeemed(once, '07029'), {});

  memory.set('k', '{壞掉');
  assert.deepEqual(loadRedeemed(storage, 'k'), {});
  memory.set('k', '[1]');
  assert.deepEqual(loadRedeemed(storage, 'k'), {});
  assert.deepEqual(loadRedeemed(undefined, 'k'), {});
  assert.equal(saveRedeemed(undefined, 'k', once), false);
});

test('decodePlaces 還原省略欄位', () => {
  const data = decodePlaces({ cities: ['台北市'], categories: ['A'], places: [['aaaaaaa', 0, 'n', 0, 1, 'addr'], ['bbbbbbb', 0, 'm', 0, 3, 'addr2', 'q', 'B1']] });
  assert.deepEqual(data.places, [
    { id: 'aaaaaaa', cat: 0, name: 'n', city: '台北市', points: 1, address: 'addr', query: 'addr', note: '' },
    { id: 'bbbbbbb', cat: 0, name: 'm', city: '台北市', points: 3, address: 'addr2', query: 'q', note: 'B1' },
  ]);
});

test('匯出 q、匯入 q 與舊版代號', () => {
  const now = new Date('2026-10-14T00:00:00Z');
  const codes = [{ id: 'cccccccccccc', code: '07029' }];
  assert.equal(exportRedeemed({ bbbbbbbbbbbb: 'x', aaaaaaaaaaaa: 'y', '07029': 'old', junk: 'z' }), 'aaaaaaaaaaaa bbbbbbbbbbbb');

  const { redeemed, added } = importRedeemed({ aaaaaaaaaaaa: 'x' }, 'AAAAAAAAAAAA 07029 99999 dddddddddddd', codes, now);
  assert.equal(added, 2);
  assert.equal(redeemed.aaaaaaaaaaaa, 'x', '已存在的保留原時間');
  assert.equal(redeemed.cccccccccccc, '2026-10-14T00:00:00.000Z', '舊代號換成 q');
  assert.equal(redeemed.dddddddddddd, '2026-10-14T00:00:00.000Z');
  assert.equal(redeemed['99999'], undefined, '清單裡找不到的代號略過');
  assert.equal(importRedeemed({}, '').added, 0);
});

test('displayLabel 用 q 末八碼', async () => {
  const { displayLabel } = await import('../assets/store.js');
  assert.equal(displayLabel({ id: 'ff2948060d7a', code: '07029' }), '48060d7a');
});
