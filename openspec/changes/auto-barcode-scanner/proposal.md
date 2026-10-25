# Proposal

## Why

The browser barcode scanner asks the user to pick a "Library" (@zxing/library, html5-qrcode, quagga2) and a
camera before scanning. The user neither knows nor cares which decoder runs; when the chosen one struggles
with a phone's camera, the only hint is "try another engine", and switching restarts the camera. Every
library also opens its own camera stream with no resolution or focus request, and the first value any of
them reads is accepted as is, so a misread (Quagga2 is prone to them) goes straight to the product lookup.

## What Changes

- **One scan button, no library choice.** The web scanner opens the rear camera at once and decodes
  automatically. The "Library" select is removed; the camera select becomes a "switch camera" button shown
  only when the device has more than one camera (the choice is still remembered per device).
- **One camera stream, decoders best first.** The scanner owns a single `getUserMedia` stream (rear camera,
  up to 1080p, continuous focus where supported) and feeds its frames to decoders in order of quality:
  the browser's built-in `BarcodeDetector` when it exists (Chrome on Android, Chrome on macOS), else ZXing
  limited to product barcodes; when nothing is read for a while, ZXing (if the native detector was first)
  and then Quagga2 join in on the same frames. No camera restart, nothing visible to the user.
- **Product barcodes first.** Only EAN-13, EAN-8, UPC-A, UPC-E and Code 128 are decoded. QR codes are not:
  packages often print a marketing QR next to the barcode, and it would win the race.
- **Fewer misreads.** EAN/UPC codes must pass their check digit. A code read by the built-in detector or
  ZXing with a valid check digit is accepted at once; anything else (Quagga2 reads, Code 128) only when the
  same value is read twice within 1.5 s.
- **Lighter scanner.** html5-qrcode (~370 KB, a second wrapper around the same ZXing decoder) is removed;
  ZXing and Quagga2 are loaded only when the built-in detector is missing or has not found a code yet.
- Scanner status texts become translatable (en, ru).

Upstream: yes — generic for every web/PWA user, no fork-only files; offer as a PR against upstream `dev`.

Out of scope: the Android app's ML Kit scanner (unchanged); QR codes; reading barcodes from a photo or
file; changing what happens after a code is read (lookup order is the `food-search` capability).

## Capabilities

### New Capabilities
- `barcode-scanning`: scanning a product barcode with the device camera in the web app.

### Modified Capabilities
<!-- none -->

## Impact

- Client: new `src/lib/barcode-scan.js` (pure helpers: check digits, confirmation, decoder schedule) and
  `src/lib/barcode-decoders.js` (browser decoders over one video element);
  `src/components/foods/BarcodeScanner.svelte` web part rewritten (native part unchanged);
  `public/vendor/html5-qrcode.min.js` removed; `capacitor.config.ts` comment; `src/i18n/en.json`, `ru.json`
  (status keys added, `barcode_scanner.library` removed from every locale).
- Tests: `scripts/barcode-scan.test.js`.
