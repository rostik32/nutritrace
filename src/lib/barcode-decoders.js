/**
 * barcode-decoders.js
 *
 * The web scanner's decoders, all reading frames of the one <video> the
 * scanner shows, best first: the browser's own BarcodeDetector, ZXing, then
 * Quagga2. Each is { id, decode(video) => Promise<{ code, format } | null> }.
 * ZXing and Quagga2 are UMD bundles in public/vendor/, injected the first
 * time they are asked for, so a browser whose built-in detector reads the
 * code at once loads neither. Which decoder runs when, and which reads count,
 * is decided in barcode-scan.js.
 */
import { PRODUCT_FORMATS } from './barcode-scan.js';

const _scripts = new Map();
function _inject(src) {
  if (!_scripts.has(src)) {
    _scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { _scripts.delete(src); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  return _scripts.get(src);
}
const _vendor = (file) => (import.meta.env?.BASE_URL || '/') + 'vendor/' + file;

// One canvas per frame for the JS decoders, scaled down: decoding time grows
// with the pixel count and a product barcode reads fine at this width.
function _frame(video, maxWidth) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, maxWidth / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The browser's built-in detector, or null where there is none (iOS Safari, Firefox). */
async function nativeDecoder() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  let formats = PRODUCT_FORMATS;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    formats = PRODUCT_FORMATS.filter(f => supported.includes(f));
  } catch { /* assume all */ }
  if (!formats.length) return null;
  let detector;
  try { detector = new window.BarcodeDetector({ formats }); } catch { return null; }
  return {
    id: 'native',
    async decode(video) {
      const found = await detector.detect(video);
      const hit = found && found[0];
      return hit ? { code: hit.rawValue, format: hit.format } : null;
    },
  };
}

function zxingDecoder() {
  let reader = null;
  return {
    id: 'zxing',
    async decode(video) {
      if (!reader) {
        await _inject(_vendor('zxing.min.js'));
        const Z = window.ZXing;
        const F = Z.BarcodeFormat;
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        reader = new Z.MultiFormatReader();
        reader.setHints(hints);
      }
      const canvas = _frame(video, 1280);
      if (!canvas) return null;
      const Z = window.ZXing;
      try {
        const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
        const r = reader.decodeWithState(bitmap);
        return { code: r.getText(), format: String(Z.BarcodeFormat[r.getBarcodeFormat()] || '').toLowerCase() };
      } catch {
        return null;   // NotFound / Checksum / Format: nothing on this frame
      } finally {
        reader.reset();
      }
    },
  };
}

function quaggaDecoder() {
  let loaded = false;
  return {
    id: 'quagga',
    async decode(video) {
      if (!loaded) { await _inject(_vendor('quagga2.min.js')); loaded = true; }
      const canvas = _frame(video, 800);
      if (!canvas) return null;
      return new Promise((resolve) => {
        window.Quagga.decodeSingle({
          src: canvas.toDataURL('image/jpeg', 0.85),
          numOfWorkers: 0,
          locate: true,
          inputStream: { size: 800 },
          decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader'] },
        }, (result) => {
          const r = result && result.codeResult;
          resolve(r && r.code ? { code: r.code, format: r.format } : null);
        });
      });
    },
  };
}

/** The decoders this browser has, best first. */
export async function createDecoders() {
  const native = await nativeDecoder();
  return [...(native ? [native] : []), zxingDecoder(), quaggaDecoder()];
}
