# Tasks

## 1. Pure helpers

- [x] 1.1 `src/lib/barcode-scan.js`: check digits (GTIN, UPC-E), `createConfirmer`, `decodersForTick`; tests in `scripts/barcode-scan.test.js`

## 2. Decoders and scanner

- [x] 2.1 `src/lib/barcode-decoders.js`: native / zxing / quagga decoders over one video element, lazy script loading
- [x] 2.2 Rewrite the web half of `BarcodeScanner.svelte`: one stream, tick loop, confirmer, switch camera, i18n status texts; native half unchanged
- [x] 2.3 Remove `public/vendor/html5-qrcode.min.js` and `barcode_scanner.library`; update the `capacitor.config.ts` comment

## 2b. Scan from a photo (owner's request)

- [x] 2.4 `decodeImage(file)` in `barcode-decoders.js`; "From Photo" button on the web scanner and the Android overlay (ML Kit `readBarcodesFromImage`); strings in en + ru

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
- From Photo (3000×4000 JPEG of a package, barcode ~15 % of the width): built-in detector 271 ms (8° tilt); ZXing
  only 75 ms (8°) and 116 ms (sideways, 90°); a photo without a barcode and one with a wrong check digit show
  "No barcode found in the photo" and leave the scanner open. Quagga2 alone (built-in detector and ZXing
  disabled) read 1 of 3 test photos: it is the last resort and only runs when the other two found nothing.
Not verifiable here: real cameras (focus, light, iPhone Safari, Android Chrome) and the Android photo button
(ML Kit `readBarcodesFromImage`, needs a device).
