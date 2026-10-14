/**
 * 開發用快速掃描：相機持續掃，符合格式的 QR 自動加入清單，複製後交給 scripts/add-codes.mjs 收錄。
 */
import { getQrReader } from '../assets/qr-reader.js';
import { addScan, removeScan, setScanCode, toExportText } from '../assets/scan-list.js';
import { parseStarUrl } from '../assets/submission.js';

const STORAGE_KEY = 'mcd-stargame-2026:quick-scan';
const SCAN_INTERVAL_MS = 120;

const $ = (id) => document.getElementById(id);

function loadList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('quickScan.loadList | 讀取清單失敗', error);
    return [];
  }
}

const state = {
  list: loadList(),
  known: new Map(),
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.list));
  } catch (error) {
    console.warn('quickScan.save | 寫入清單失敗', error);
  }
}

function showError(message) {
  $('error').textContent = message ?? '';
  $('error').hidden = !message;
}

function render() {
  const knownIds = new Set(state.known.keys());
  $('count-all').textContent = String(state.list.length);
  $('count-new').textContent = String(state.list.filter((s) => !knownIds.has(s.id)).length);
  $('list').replaceChildren(...state.list.map(renderRow));
}

function renderRow(scan) {
  const li = document.createElement('li');
  const id = document.createElement('span');
  id.className = 'id';
  const knownCode = state.known.get(scan.id);

  if (knownCode) {
    id.textContent = `${knownCode} · 已收錄`;
    id.classList.add('known');
    const spacer = document.createElement('span');
    li.append(id, spacer);
  } else {
    id.textContent = scan.id;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 5;
    input.placeholder = '代號';
    input.value = scan.code;
    input.setAttribute('aria-label', `${scan.id} 的代號`);
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 5);
      state.list = setScanCode(state.list, scan.id, input.value);
      save();
    });
    li.append(id, input);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn';
  remove.textContent = '刪除';
  remove.addEventListener('click', () => {
    state.list = removeScan(state.list, scan.id);
    save();
    render();
  });
  li.append(remove);
  return li;
}

let flashTimer = 0;
function flash(kind, text) {
  $('camera').dataset.flash = kind;
  $('toast').textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    $('camera').dataset.flash = '';
    $('toast').textContent = '';
  }, 900);
}

function handleText(text) {
  const id = parseStarUrl(text);
  if (!id) return;
  const { list, added } = addScan(state.list, id);
  if (!added) return;
  state.list = list;
  save();
  render();
  const knownCode = state.known.get(id);
  if (knownCode) {
    flash('known', `已收錄 ${knownCode}`);
  } else {
    flash('new', `新 ${id}`);
    navigator.vibrate?.(60);
  }
}

let stream = null;
let timer = 0;

async function start() {
  showError(null);
  let read;
  try {
    [read, stream] = await Promise.all([
      getQrReader(),
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }),
    ]);
  } catch (error) {
    console.error('quickScan.start | 無法開啟相機', error);
    showError('無法開啟相機');
    return;
  }
  const video = $('video');
  video.srcObject = stream;
  await video.play();
  $('start').hidden = true;
  $('stop').hidden = false;

  const tick = async () => {
    if (!stream) return;
    try {
      const text = await read(video);
      if (text) handleText(text);
    } catch (error) {
      console.warn('quickScan.tick | 辨識失敗', error);
    }
    timer = setTimeout(tick, SCAN_INTERVAL_MS);
  };
  tick();
}

function stop() {
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('video').srcObject = null;
  $('start').hidden = false;
  $('stop').hidden = true;
}

async function copyNew() {
  const text = toExportText(state.list, new Set(state.known.keys()));
  const button = $('copy');
  if (!text) {
    button.textContent = '沒有新的';
  } else {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = `已複製 ${text.split('\n').length} 筆`;
    } catch (error) {
      console.warn('quickScan.copy | 複製失敗', error);
      window.prompt('複製', text);
    }
  }
  setTimeout(() => {
    button.textContent = '複製新的';
  }, 1500);
}

async function loadKnown() {
  try {
    const response = await fetch('../data/codes.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const codes = await response.json();
    state.known = new Map(codes.map((c) => [c.id, c.code]));
  } catch (error) {
    console.error('quickScan.loadKnown | 讀取已收錄清單失敗', error);
    showError('已收錄清單載入失敗');
  }
  render();
}

$('start').addEventListener('click', start);
$('stop').addEventListener('click', stop);
$('copy').addEventListener('click', copyNew);
$('clear').addEventListener('click', () => {
  if (state.list.length && !window.confirm(`清空 ${state.list.length} 筆？`)) return;
  state.list = [];
  save();
  render();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});

render();
loadKnown();
