# Tasks

## 1. Pure helpers

- [x] 1.1 `src/lib/barcode-scan.js`: check digits (GTIN, UPC-E), `createConfirmer`, `decodersForTick`; tests in `scripts/barcode-scan.test.js`

## 2. Decoders and scanner

- [x] 2.1 `src/lib/barcode-decoders.js`: native / zxing / quagga decoders over one video element, lazy script loading
- [x] 2.2 Rewrite the web half of `BarcodeScanner.svelte`: one stream, tick loop, confirmer, switch camera, i18n status texts; native half unchanged
- [x] 2.3 Remove `public/vendor/html5-qrcode.min.js` and `barcode_scanner.library`; update the `capacitor.config.ts` comment

## 3. Integration

- [x] 3.1 `npm test`, `npm run i18n:check`, `npm run build`; walk the scenarios in a local production build with a synthetic camera stream, with and without `BarcodeDetector`

## Verification notes

2026-10-26, Node 20: `npm test` 974/974 (8 new in `barcode-scan.test.js`), `npm run i18n:check` passes, `npm run build` ok.

Walked in a local production build (phone viewport) with the camera replaced by a canvas stream showing generated
EAN-13 barcodes (debug script in the page, not in the app):
- Built-in detector present: own food 5099603111157 read on the first `detect` call; ZXing and Quagga2 never loaded;
  the food opened in the editor.
- `BarcodeDetector` removed: ZXing read it, scanner closed 319 ms after opening (script load included); Quagga2 not
  loaded.
- ZXing broken on purpose: dropped after three failures, Quagga2 read 3017620422003 on the same stream about 1 s after
  opening (two identical reads); the OFF product sheet opened.
- Wrong check digit (3017620422004): nothing reported in 4.5 s while all three decoders ran.
- Two cameras: "Switch Camera" shown, choice remembered, valid code read 578 ms after switching.
Not verifiable here: real cameras (focus, light, iPhone Safari, Android Chrome).
