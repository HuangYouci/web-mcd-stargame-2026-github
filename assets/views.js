/**
 * 純展示元件：只依參數建立 DOM，資料與動作一律由呼叫端注入。
 */
import { encodeQr, qrToPath } from './qr.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const pathCache = new Map();

/** 小工具：建立元素。on* 屬性綁事件、text 設文字，其餘當 attribute。 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

/**
 * QR Code 圖形，同一段文字只編碼一次。
 * @param {{ text: string, label: string }} props
 */
export function QrImage({ text, label }) {
  let hit = pathCache.get(text);
  if (!hit) {
    const qr = encodeQr(text);
    hit = { extent: qr.size + 8, d: qrToPath(qr) };
    pathCache.set(text, hit);
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${hit.extent} ${hit.extent}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('shape-rendering', 'crispEdges');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', hit.d);
  svg.append(path);
  return svg;
}

/**
 * QR Code 卡片。QR 圖形由 onQrSlot 決定何時掛上（例如進入畫面才產生）。
 * @param {{
 *   entry: { code: string, url: string },
 *   redeemed: boolean,
 *   onToggleRedeemed: () => void,
 *   onShowQr: () => void,
 *   onQrSlot: (slot: HTMLElement) => void,
 * }} props
 */
export function CodeCard({ entry, redeemed, onToggleRedeemed, onShowQr, onQrSlot }) {
  const slot = el('button', {
    type: 'button',
    class: 'qr-slot',
    'aria-label': `放大 ${entry.code} 的 QR Code`,
    'data-text': entry.url,
    onClick: onShowQr,
  });
  onQrSlot(slot);

  return el('article', { class: redeemed ? 'code-card is-redeemed' : 'code-card', 'data-code': entry.code }, [
    slot,
    el('strong', { class: 'code', text: entry.code }),
    el('div', { class: 'code-actions' }, [
      el('label', { class: 'check-label' }, [
        el('input', { type: 'checkbox', checked: redeemed, onChange: onToggleRedeemed }),
        el('span', { text: '已兌換' }),
      ]),
      el('a', { class: 'btn', href: entry.url, target: '_blank', rel: 'noopener', text: '開啟網址' }),
    ]),
  ]);
}

/**
 * 點位表格的一列。
 * @param {{ place: { name: string, address: string, note: string }, mapsUrl: string }} props
 */
export function PlaceRow({ place, mapsUrl }) {
  return el('tr', {}, [
    el('td', { class: 'name' }, [
      el('span', { text: place.name }),
      place.note ? el('small', { text: place.note }) : null,
    ]),
    el('td', { class: 'address' }, [el('a', { href: mapsUrl, target: '_blank', rel: 'noopener', text: place.address })]),
  ]);
}

/**
 * 掃描結果。
 * @param {{
 *   id: string,
 *   known: { code: string } | null,
 *   redeemedAt: string | null,
 *   onToggleRedeemed: () => void,
 *   form: HTMLElement | null,
 * }} props
 */
export function ScanResult({ id, known, redeemedAt, onToggleRedeemed, form }) {
  const head = known
    ? el('div', { class: 'scan-head' }, [el('strong', { class: 'scan-code', text: known.code }), el('span', { class: 'muted', text: '已收錄' })])
    : el('div', { class: 'scan-head' }, [el('strong', { text: '未收錄' }), el('span', { class: 'muted mono', text: `q=${id}` })]);

  return el('div', { class: 'scan-result' }, [
    head,
    redeemedAt ? el('p', { class: 'notice', text: `已兌換 · ${formatDate(redeemedAt)}` }) : null,
    known
      ? el('label', { class: 'check-label' }, [
          el('input', { type: 'checkbox', checked: Boolean(redeemedAt), onChange: onToggleRedeemed }),
          el('span', { text: '已兌換' }),
        ])
      : null,
    form,
  ]);
}

function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 側欄卡片。
 * @param {{ title: string, description: string, url: string, image?: string }} props
 */
export function PromoCard({ title, description, url, image }) {
  return el('a', { class: 'promo-card', href: url, target: '_blank', rel: 'noopener' }, [
    image ? el('img', { src: image, alt: '', loading: 'lazy', decoding: 'async', width: '48', height: '48' }) : null,
    el('div', {}, [el('strong', { text: title }), description ? el('p', { text: description }) : null]),
  ]);
}

/** 表格空狀態。 */
export function EmptyRow({ text, columns }) {
  return el('tr', { class: 'empty' }, [el('td', { colspan: String(columns), text })]);
}

/** 空狀態。 */
export function EmptyState({ text }) {
  return el('p', { class: 'empty', text });
}
