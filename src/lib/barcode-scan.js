/**
 * barcode-scan.js
 *
 * The decisions of the web barcode scanner that need no camera: which
 * decoders run on a frame, and whether a code they report is taken. Plain
 * JS so it can be unit-tested; the decoders themselves live in
 * barcode-decoders.js and the camera in BarcodeScanner.svelte.
 */

/** Barcodes a food product carries. QR is left out on purpose: a package's
 *  marketing QR next to the barcode would otherwise win the race. */
export const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

const GTIN_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a']);

// ── Check digits ─────────────────────────────────────────────────────────

/** GTIN-8/12/13/14 mod-10 check digit (EAN-13, EAN-8, UPC-A). */
export function gtinValid(code) {
  const s = String(code ?? '');
  if (!/^\d{8}$|^\d{12,14}$/.test(s)) return false;
  let sum = 0;
  for (let i = s.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(s[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(s[s.length - 1]);
}

/** UPC-E (8 digits, number system 0 or 1) expanded to its 12-digit UPC-A. */
export function upcEToUpcA(code) {
  const s = String(code ?? '');
  if (!/^[01]\d{7}$/.test(s)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = s;
  let body;
  if (d6 <= '2') body = d1 + d2 + d6 + '0000' + d3 + d4 + d5;
  else if (d6 === '3') body = d1 + d2 + d3 + '00000' + d4 + d5;
  else if (d6 === '4') body = d1 + d2 + d3 + d4 + '00000' + d5;
  else body = d1 + d2 + d3 + d4 + d5 + '0000' + d6;
  return ns + body + check;
}

/**
 * False only for a code whose check digit is provably wrong: an EAN / UPC
 * code (by format, or by being all digits of a GTIN length when the format
 * is unknown) that fails it. Code 128 carries its own check inside the
 * symbol, so anything else passes here.
 */
export function checkDigitOk(code, format) {
  const s = String(code ?? '');
  if (format === 'upc_e') {
    const a = upcEToUpcA(s);
    return !!a && gtinValid(a);
  }
  if (GTIN_FORMATS.has(format)) return gtinValid(s);
  if (format) return true;
  if (/^\d{12,14}$/.test(s)) return gtinValid(s);
  if (/^\d{8}$/.test(s)) return gtinValid(s) || gtinValid(upcEToUpcA(s));
  return true;
}

// ── Accepting a read ─────────────────────────────────────────────────────

/** Decoders whose EAN / UPC reads are trusted once the check digit holds. */
const TRUSTED = new Set(['native', 'zxing']);

/**
 * Decide whether a decoder's read is reported. A read with a wrong check
 * digit is dropped. A trusted decoder's EAN / UPC read is taken at once;
 * anything else (Quagga2, Code 128) only when the same value was read
 * within `windowMs` before.
 */
export function createConfirmer({ windowMs = 1500 } = {}) {
  const lastSeen = new Map();
  return {
    offer({ code, format, decoder }, now = Date.now()) {
      const value = String(code ?? '').trim();
      if (!value || !checkDigitOk(value, format)) return null;
      const gtin = format ? (GTIN_FORMATS.has(format) || format === 'upc_e') : /^\d+$/.test(value);
      if (TRUSTED.has(decoder) && gtin) return value;
      const prev = lastSeen.get(value);
      lastSeen.set(value, now);
      return prev != null && now - prev <= windowMs ? value : null;
    },
  };
}

// ── Schedule ─────────────────────────────────────────────────────────────

/**
 * Decoders due on this tick. `ranked` lists the available decoders best
 * first. Rank r joins after r × joinMs without a result and then runs on
 * every (r + 1)-th tick, so better decoders get most of the frames and
 * weaker ones help only when the better ones keep failing.
 */
export function decodersForTick(ranked, tick, elapsedMs, { joinMs = 1500 } = {}) {
  return (ranked || []).filter((_, r) => elapsedMs >= r * joinMs && tick % (r + 1) === 0);
}
