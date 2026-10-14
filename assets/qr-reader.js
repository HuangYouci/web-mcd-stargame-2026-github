/**
 * 從圖片或相機畫面讀 QR Code。
 * 有原生 BarcodeDetector（Chrome、Android）就用原生；沒有（iOS Safari）才載入 jsQR，首頁不會下載它。
 */

// 以模組位置解析，子目錄頁面（quick-scan-dev）也能載入
const JSQR_SRC = new URL('./vendor/jsQR.js', import.meta.url).href;
const MAX_SIDE = 1024;

let readerPromise = null;

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return formats.includes('qr_code') ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  } catch (error) {
    console.warn('qrReader.nativeDetector | 無法使用原生辨識', error);
    return null;
  }
}

function loadJsQr() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSQR_SRC;
    script.async = true;
    script.onload = () => (typeof window.jsQR === 'function' ? resolve(window.jsQR) : reject(new Error('jsQR 載入後不存在')));
    script.onerror = () => reject(new Error('jsQR 載入失敗'));
    document.head.append(script);
  });
}

async function createReader() {
  const detector = await nativeDetector();
  if (detector) {
    return async (source) => {
      const found = await detector.detect(source);
      return found.map((f) => f.rawValue).find(Boolean) ?? null;
    };
  }

  const jsQR = await loadJsQr();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (source) => {
    const width = source.videoWidth || source.width;
    const height = source.videoHeight || source.height;
    if (!width || !height) return null;
    // 縮小再辨識，相機逐格掃描時才跟得上
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null;
  };
}

/**
 * 取得讀取函式，只建立一次。
 * @returns {Promise<(source: HTMLVideoElement | ImageBitmap) => Promise<string | null>>}
 */
export function getQrReader() {
  readerPromise ??= createReader().catch((error) => {
    readerPromise = null;
    throw error;
  });
  return readerPromise;
}
