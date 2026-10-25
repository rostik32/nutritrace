/**
 * Web barcode scanner decisions (src/lib/barcode-scan.js): which decoders
 * run on a frame and which reads are reported.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gtinValid, upcEToUpcA, checkDigitOk, createConfirmer, decodersForTick } from '../src/lib/barcode-scan.js';

test('GTIN check digit: EAN-13, EAN-8, UPC-A', () => {
  assert.equal(gtinValid('4006381333931'), true);
  assert.equal(gtinValid('4006381333932'), false);
  assert.equal(gtinValid('3017620422003'), true);   // Nutella
  assert.equal(gtinValid('96385074'), true);        // EAN-8
  assert.equal(gtinValid('036000291452'), true);    // UPC-A
  assert.equal(gtinValid('036000291453'), false);
  assert.equal(gtinValid('12345'), false);
  assert.equal(gtinValid('abc'), false);
});

test('UPC-E expands to UPC-A and is checked on it', () => {
  assert.equal(upcEToUpcA('04252614'), '042100005264');
  assert.equal(checkDigitOk('04252614', 'upc_e'), true);
  assert.equal(checkDigitOk('04252615', 'upc_e'), false);
  assert.equal(upcEToUpcA('24252614'), null);
});

test('check digit by format; unknown formats judged by shape', () => {
  assert.equal(checkDigitOk('4006381333932', 'ean_13'), false);
  assert.equal(checkDigitOk('ABC-123', 'code_128'), true);
  assert.equal(checkDigitOk('4006381333932', undefined), false);
  assert.equal(checkDigitOk('04252614', undefined), true);
  assert.equal(checkDigitOk('ABC-123', undefined), true);
});

test('trusted decoder with a valid EAN is taken at once', () => {
  const c = createConfirmer();
  assert.equal(c.offer({ code: '4006381333931', format: 'ean_13', decoder: 'zxing' }, 0), '4006381333931');
  assert.equal(c.offer({ code: '3017620422003', format: 'ean_13', decoder: 'native' }, 0), '3017620422003');
});

test('a wrong check digit is never taken', () => {
  const c = createConfirmer();
  assert.equal(c.offer({ code: '4006381333932', format: 'ean_13', decoder: 'native' }, 0), null);
  assert.equal(c.offer({ code: '4006381333932', format: 'ean_13', decoder: 'quagga' }, 100), null);
  assert.equal(c.offer({ code: '4006381333932', format: 'ean_13', decoder: 'quagga' }, 200), null);
});

test('Quagga2 and Code 128 need the same value twice within the window', () => {
  const c = createConfirmer({ windowMs: 1500 });
  assert.equal(c.offer({ code: '4006381333931', format: 'ean_13', decoder: 'quagga' }, 0), null);
  assert.equal(c.offer({ code: '4006381333931', format: 'ean_13', decoder: 'quagga' }, 400), '4006381333931');
  assert.equal(c.offer({ code: 'LOT-42', format: 'code_128', decoder: 'native' }, 0), null);
  assert.equal(c.offer({ code: 'LOT-42', format: 'code_128', decoder: 'zxing' }, 2000), null);
  assert.equal(c.offer({ code: 'LOT-42', format: 'code_128', decoder: 'zxing' }, 2500), 'LOT-42');
});

test('schedule with the built-in detector: ZXing at 1.5 s, Quagga2 at 3 s', () => {
  const ranked = ['native', 'zxing', 'quagga'];
  assert.deepEqual(decodersForTick(ranked, 0, 0), ['native']);
  assert.deepEqual(decodersForTick(ranked, 1, 1000), ['native']);
  assert.deepEqual(decodersForTick(ranked, 2, 1600), ['native', 'zxing']);
  assert.deepEqual(decodersForTick(ranked, 3, 1700), ['native']);
  assert.deepEqual(decodersForTick(ranked, 6, 3100), ['native', 'zxing', 'quagga']);
  assert.deepEqual(decodersForTick(ranked, 9, 3500), ['native', 'quagga']);
});

test('schedule without it: ZXing from the start, Quagga2 at 1.5 s', () => {
  const ranked = ['zxing', 'quagga'];
  assert.deepEqual(decodersForTick(ranked, 0, 0), ['zxing']);
  assert.deepEqual(decodersForTick(ranked, 2, 1000), ['zxing']);
  assert.deepEqual(decodersForTick(ranked, 4, 1500), ['zxing', 'quagga']);
  assert.deepEqual(decodersForTick(ranked, 5, 1600), ['zxing']);
});
