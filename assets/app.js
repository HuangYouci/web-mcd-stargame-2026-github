/**
 * 進入點：讀取資料、管理狀態、把資料與動作注入展示元件。
 */
import { SITE_CONFIG } from './config.js';
import { filterCodes, filterPlaces, mapsSearchUrl } from './filters.js';
import { decodePlaces } from './places.js';
import { getQrReader } from './qr-reader.js';
import { exportRedeemed, importRedeemed, loadRedeemed, migrateRedeemed, redeemKey, saveRedeemed, toggleRedeemed } from './store.js';
import { CODE_PATTERN, buildIssueUrl, canonicalUrl, parseStarUrl } from './submission.js';
import { CodeCard, EmptyRow, EmptyState, PlaceRow, PromoCard, QrImage, ScanResult, el } from './views.js';

const PLACE_PAGE_SIZE = 50;
const TABS = ['codes', 'scan', 'places'];
const SCAN_INTERVAL_MS = 200;

const storage = (() => {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('app | 無法使用 localStorage', error);
    return undefined;
  }
})();

const state = {
  codes: [],
  placesData: null,
  redeemed: loadRedeemed(storage, SITE_CONFIG.storageKey),
  codeFilter: { query: '', status: 'all' },
  placeFilter: { query: '', cat: '', city: '' },
  placeLimit: PLACE_PAGE_SIZE,
  scannedId: null,
};

const $ = (id) => document.getElementById(id);

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`app.fetchJson | ${path} HTTP ${response.status}`);
  return response.json();
}

function setRedeemed(next) {
  state.redeemed = next;
  saveRedeemed(storage, SITE_CONFIG.storageKey, next);
  renderStats();
  $('backup-export').value = exportRedeemed(next);
}

function renderStats() {
  const known = new Set(state.codes.map(redeemKey));
  $('stat-redeemed').textContent = String(Object.keys(state.redeemed).filter((c) => known.has(c)).length);
  $('stat-codes').textContent = String(state.codes.length);
}

// ---- QR Code 分頁 ----

// 進入畫面附近才產生 QR，清單變長時首屏不會卡
const qrObserver =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            mountQr(entry.target);
            qrObserver.unobserve(entry.target);
          }
        },
        { rootMargin: '400px 0px' },
      )
    : null;

function mountQr(slot) {
  if (slot.firstChild) return;
  slot.append(QrImage({ text: slot.dataset.text, label: slot.getAttribute('aria-label') }));
}

function buildCard(entry) {
  return CodeCard({
    entry,
    redeemed: Boolean(state.redeemed[redeemKey(entry)]),
    onToggleRedeemed: () => {
      setRedeemed(toggleRedeemed(state.redeemed, redeemKey(entry)));
      // 只換掉這一張，不重繪整份清單
      const old = $('code-grid').querySelector(`[data-id="${entry.id}"]`);
      const visible = filterCodes([entry], state.codeFilter, state.redeemed).length > 0;
      if (old && visible) old.replaceWith(buildCard(entry));
      else renderCodes();
      if (state.scannedId === entry.id) renderScanResult();
    },
    onShowQr: () => openQrDialog(entry),
    onQrSlot: (slot) => (qrObserver ? qrObserver.observe(slot) : mountQr(slot)),
  });
}

function renderCodes() {
  const list = filterCodes(state.codes, state.codeFilter, state.redeemed);
  const emptyText = state.codes.length === 0 ? '還沒有 QR Code。' : '沒有符合的 QR Code。';
  $('code-grid').replaceChildren(...(list.length ? list.map(buildCard) : [EmptyState({ text: emptyText })]));
}

function openQrDialog(entry) {
  $('qr-dialog-title').textContent = entry.code || '待補代號';
  $('qr-dialog-body').replaceChildren(QrImage({ text: entry.url, label: `${entry.code || entry.id} 的 QR Code` }));
  $('qr-dialog-link').href = entry.url;
  $('qr-dialog').showModal();
}

function bindCodeControls() {
  $('code-query').addEventListener('input', (event) => {
    state.codeFilter.query = event.target.value;
    renderCodes();
  });
  const radios = document.querySelectorAll('[data-status]');
  radios.forEach((button) => {
    button.addEventListener('click', () => {
      state.codeFilter.status = button.dataset.status;
      radios.forEach((b) => b.setAttribute('aria-checked', String(b === button)));
      renderCodes();
    });
  });
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      // 點背景關閉
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
  }
}

// ---- 匯入匯出 ----

function bindBackup() {
  $('backup-open').addEventListener('click', () => {
    $('backup-export').value = exportRedeemed(state.redeemed);
    $('backup-result').textContent = '';
    $('backup-dialog').showModal();
  });
  $('backup-copy').addEventListener('click', async () => {
    const button = $('backup-copy');
    try {
      await navigator.clipboard.writeText($('backup-export').value);
      button.textContent = '已複製';
    } catch (error) {
      console.warn('app.backupCopy | 複製失敗', error);
      $('backup-export').select();
      button.textContent = '複製失敗';
    }
    setTimeout(() => {
      button.textContent = '複製';
    }, 1500);
  });
  $('backup-import-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const { redeemed, added } = importRedeemed(state.redeemed, $('backup-import').value);
    setRedeemed(redeemed);
    renderCodes();
    renderPlaces();
    $('backup-import').value = '';
    $('backup-result').textContent = `匯入 ${added} 個`;
  });
}

// ---- 點位 ----

let placesLoading = null;

function ensurePlaces() {
  if (state.placesData) return Promise.resolve(state.placesData);
  placesLoading ??= fetchJson('data/places.json')
    .then((raw) => {
      state.placesData = decodePlaces(raw);
      fillPlaceSelects(state.placesData);
      renderPlaces();
      return state.placesData;
    })
    .catch((error) => {
      console.error('app.ensurePlaces | 讀取點位失敗', error);
      $('place-rows').replaceChildren(EmptyRow({ text: '點位載入失敗。', columns: 2 }));
      placesLoading = null;
      return null;
    });
  return placesLoading;
}

function fillPlaceSelects(data) {
  const catSelect = $('place-cat');
  data.categories.forEach((name, i) => catSelect.append(new Option(name, String(i))));
  const usedCities = new Set(data.places.map((p) => p.city));
  const citySelect = $('place-city');
  data.cities.filter((c) => usedCities.has(c)).forEach((city) => citySelect.append(new Option(city, city)));
}

function renderPlaces() {
  const data = state.placesData;
  if (!data) return;
  const list = filterPlaces(data.places, state.placeFilter);
  $('place-count').textContent = `${list.length} 個點位`;
  const rows = list
    .slice(0, state.placeLimit)
    .map((place) => PlaceRow({ place, mapsUrl: mapsSearchUrl(place.query) }));
  $('place-rows').replaceChildren(...(rows.length ? rows : [EmptyRow({ text: '沒有符合的點位。', columns: 2 })]));
  $('place-more').hidden = list.length <= state.placeLimit;
}

function bindPlaceControls() {
  let timer = 0;
  const update = (key, debounce) => (event) => {
    state.placeFilter[key] = event.target.value;
    state.placeLimit = PLACE_PAGE_SIZE;
    clearTimeout(timer);
    if (debounce) timer = setTimeout(renderPlaces, 120);
    else renderPlaces();
  };
  $('place-query').addEventListener('input', update('query', true));
  $('place-cat').addEventListener('change', update('cat', false));
  $('place-city').addEventListener('change', update('city', false));
  $('place-more').addEventListener('click', () => {
    state.placeLimit += PLACE_PAGE_SIZE;
    renderPlaces();
  });
}

// ---- 掃描 ----

function showScanError(message) {
  const node = $('scan-error');
  node.textContent = message ?? '';
  node.hidden = !message;
}

/** 處理讀到的文字：可能來自相機、照片或貼上。 */
function handleScannedText(text) {
  const id = parseStarUrl(text);
  state.scannedId = id;
  if (!id) {
    $('scan-result').replaceChildren();
    showScanError(text.trim() ? '不是星級遊戲的 QR Code' : null);
    return;
  }
  showScanError(null);
  renderScanResult();
}

function renderScanResult() {
  const id = state.scannedId;
  if (!id) return;
  const known = state.codes.find((c) => c.id === id) ?? null;
  const redeemedAt = known ? (state.redeemed[redeemKey(known)] ?? null) : null;
  $('scan-result').replaceChildren(
    ScanResult({
      id,
      known,
      redeemedAt,
      onToggleRedeemed: () => {
        if (!known) return;
        setRedeemed(toggleRedeemed(state.redeemed, redeemKey(known)));
        renderCodes();
        renderScanResult();
      },
      form: known?.code ? null : buildSubmitForm(id, Boolean(known)),
    }),
  );
}

/** 未收錄或缺代號的 QR Code：前往 GitHub 投稿，代號可留空。 */
function buildSubmitForm(id, fillCodeOnly) {
  const input = el('input', {
    type: 'text',
    inputmode: 'numeric',
    maxlength: '5',
    placeholder: '五位數代號',
    'aria-label': '代號',
    autocomplete: 'off',
    class: 'code-input',
  });
  const error = el('p', { class: 'field-error', hidden: true });
  const submit = el('button', {
    type: 'submit',
    class: 'btn primary',
    text: fillCodeOnly ? '前往 GitHub 補代號' : '前往 GitHub 送出',
    disabled: fillCodeOnly,
  });

  const check = () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 5);
    const code = input.value;
    const valid = CODE_PATTERN.test(code);
    const taken = valid ? state.codes.find((c) => c.code === code) : null;
    error.textContent = taken ? `${code} 已對應另一個 QR Code` : '';
    error.hidden = !taken;
    // 新的 QR 代號可留空；補代號一定要填
    submit.disabled = Boolean(taken) || (code !== '' && !valid) || (fillCodeOnly && !valid);
    return valid ? code : '';
  };
  input.addEventListener('input', check);

  return el(
    'form',
    {
      class: 'submit-form',
      onSubmit: (event) => {
        event.preventDefault();
        const code = check();
        if (submit.disabled) return;
        window.open(buildIssueUrl({ url: canonicalUrl(id), code }), '_blank', 'noopener');
      },
    },
    [el('div', { class: 'input-row' }, [input, submit]), error],
  );
}

async function readQrFromPhoto(file) {
  const [read, bitmap] = await Promise.all([getQrReader(), createImageBitmap(file)]);
  try {
    return await read(bitmap);
  } finally {
    bitmap.close();
  }
}

let cameraStream = null;
let scanTimer = 0;

async function openCamera() {
  const video = $('camera-video');
  let read;
  try {
    [read, cameraStream] = await Promise.all([
      getQrReader(),
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
    ]);
  } catch (error) {
    console.warn('app.openCamera | 無法開啟相機', error);
    closeCamera();
    showScanError('無法開啟相機');
    return;
  }
  video.srcObject = cameraStream;
  $('camera-dialog').showModal();
  await video.play();

  const tick = async () => {
    if (!cameraStream) return;
    try {
      const text = await read(video);
      if (text) {
        closeCamera();
        $('scan-url').value = text;
        handleScannedText(text);
        return;
      }
    } catch (error) {
      console.warn('app.cameraTick | 辨識失敗', error);
    }
    scanTimer = setTimeout(tick, SCAN_INTERVAL_MS);
  };
  tick();
}

function closeCamera() {
  clearTimeout(scanTimer);
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  $('camera-video').srcObject = null;
  if ($('camera-dialog').open) $('camera-dialog').close();
}

function bindScan() {
  $('scan-url').addEventListener('input', (event) => handleScannedText(event.target.value));
  $('camera-dialog').addEventListener('close', closeCamera);

  if (navigator.mediaDevices?.getUserMedia) {
    $('scan-camera').hidden = false;
    $('scan-camera').addEventListener('click', openCamera);
  }
  $('scan-photo-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await readQrFromPhoto(file);
      if (!text) {
        showScanError('照片裡找不到 QR Code');
        return;
      }
      $('scan-url').value = text;
      handleScannedText(text);
    } catch (error) {
      console.error('app.readQrFromPhoto | 解析照片失敗', error);
      showScanError('照片讀取失敗');
    }
  });
}

// ---- 側欄 ----

async function loadPromos() {
  try {
    const promos = await fetchJson('data/promos.json');
    if (!Array.isArray(promos) || promos.length === 0) return;
    $('promo-list').replaceChildren(...promos.map(PromoCard));
    $('promo').hidden = false;
  } catch (error) {
    console.warn('app.loadPromos | 讀取側欄失敗', error);
  }
}

// ---- 分頁切換 ----

function showTab(name) {
  const tab = TABS.includes(name) ? name : 'codes';
  for (const t of TABS) {
    $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
    $(`panel-${t}`).hidden = t !== tab;
  }
  if (tab === 'places') ensurePlaces();
}

function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      history.replaceState(null, '', `#${button.dataset.tab}`);
      showTab(button.dataset.tab);
    });
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));
}

async function main() {
  bindCodeControls();
  bindBackup();
  bindPlaceControls();
  bindScan();
  bindTabs();

  fetchJson('data/summary.json')
    .then((summary) => {
      $('stat-points').textContent = String(summary.pointCount);
    })
    .catch((error) => console.warn('app.main | 讀取統計失敗', error));

  try {
    state.codes = await fetchJson('data/codes.json');
    const migrated = migrateRedeemed(state.redeemed, state.codes);
    if (migrated !== state.redeemed) setRedeemed(migrated);
  } catch (error) {
    console.error('app.main | 讀取 QR Code 清單失敗', error);
    $('code-grid').replaceChildren(EmptyState({ text: 'QR Code 清單載入失敗。' }));
    return;
  }
  renderCodes();
  renderStats();
  renderPlaces();
  renderScanResult();
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300));
  idle(loadPromos);
}

main();
