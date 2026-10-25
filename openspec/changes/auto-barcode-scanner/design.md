# Design

## Context

What exists (checked 2026-10-26):
- `src/components/foods/BarcodeScanner.svelte` has two halves. Android (`isNative`) runs ML Kit behind the
  WebView; it is not touched here. The web half injects three UMD bundles from `public/vendor/`
  (`zxing.min.js` 336 KB, `html5-qrcode.min.js` 375 KB, `quagga2.min.js` 157 KB) on first open, then runs
  the engine picked in a "Library" select (`localStorage wl_scanEngine`, default zxing) on the camera
  picked in a "Camera" select (`wl_scanCamId`).
- Each engine opens the camera itself (`deviceId: exact`, no resolution or focus constraints). Switching
  engine stops the stream and starts another one 300 ms later.
- `onCode` accepts the first value reported, beeps (`barcodeBeep`), closes and dispatches `scan`. Callers
  (`Foods.svelte`, `MealEditor.svelte`, `FoodEditor.svelte`) normalise UPC-A to EAN-13 and look the code up.
- Torch: track capability `torch`, turned on at start when `barcodeFlashlight` is set.
- The browser pane used for testing has `BarcodeDetector` (formats include ean_13, ean_8, upc_e, code_128).

## Goals / Non-Goals

**Goals:** the user only aims the camera; the best decoder available runs first and weaker ones help
without a camera restart; wrong codes are rare; the pure parts are unit-tested.

**Non-Goals:** Android ML Kit path, QR codes, decoding stills, changing the lookup after `scan`.

## Decisions

### 1. One stream owned by the scanner
`getUserMedia({ video: { deviceId?, facingMode: { ideal: 'environment' }, width: { ideal: 1920 },
height: { ideal: 1080 } } })`; a remembered `wl_scanCamId` is used as `deviceId: { exact }` and dropped
if it no longer exists. After start: `focusMode: 'continuous'` via `applyConstraints` when the track
supports it, torch as today. `enumerateDevices()` after permission fills the camera list; the switch
button cycles through it and remembers the choice.

### 2. Decoders over the same video (`src/lib/barcode-decoders.js`)
Each decoder is `{ id, ready(): Promise, decode(video): Promise<{code, format} | null> }`:
- `native`: `new BarcodeDetector({ formats })` with the wanted formats the browser supports;
  `detect(video)` directly on the element.
- `zxing`: `MultiFormatReader` with `POSSIBLE_FORMATS` = EAN-13, EAN-8, UPC-A, UPC-E, Code 128 and
  `TRY_HARDER`, over a canvas copy of the frame scaled to at most 1280 px wide
  (`HTMLCanvasElementLuminanceSource` → `HybridBinarizer` → `BinaryBitmap`); "not found" → null.
- `quagga`: `Quagga.decodeSingle` on a JPEG data URL of the same canvas (`numOfWorkers: 0`,
  `locate: true`, size 800, EAN/EAN-8/UPC/UPC-E/Code 128 readers).
Scripts for zxing / quagga are injected the first time those decoders are needed, so a browser with
`BarcodeDetector` that reads the code in the first second loads nothing.

### 3. Schedule (`decodersForTick`, pure)
Decoders are ranked best first (`native` when present, `zxing`, `quagga`). Rank *r* joins after
`r × 1500 ms` without a result and then runs on every *(r + 1)*-th tick. A tick is one pass over the
decoders due, run one after another; the next tick starts ~100 ms after the previous one ends (frames
are never decoded in parallel). With the built-in detector: native from the start, ZXing from 1.5 s on
every 2nd tick, Quagga2 from 3 s on every 3rd. Without it: ZXing from the start, Quagga2 from 1.5 s on
every 2nd tick. A decoder that fails to load or throws is dropped for the session.

### 4. Accepting a code (`createConfirmer`, pure)
- EAN-13, EAN-8, UPC-A (and 12/13/14-digit codes of unknown format) must pass the GTIN mod-10 check
  digit; UPC-E is checked on its UPC-A expansion. A failing code is ignored.
- `native` or `zxing` + valid check digit → accepted at once.
- Otherwise (Quagga2, Code 128) → accepted when the same value was offered within the last 1.5 s.
The value dispatched is the raw code as read (callers already pad UPC-A).

### 5. UI
Remove the controls row (Library + Camera selects). Actions row: Refresh (restarts the stream), Flash
(when the track has a torch), Switch camera (when more than one camera). Status pill texts and these
button labels move to `barcode_scanner.*` i18n keys (en + ru). `barcode_scanner.library` is deleted from
all locales. The class `scanner-backdrop` stays (back-stack test).

## Risks / Trade-offs

- Real-device speed cannot be measured here; verified in the browser with a synthetic camera stream
  (canvas → `captureStream`) showing generated EAN-13 barcodes, with and without `BarcodeDetector`.
  The owner checks on an iPhone (no `BarcodeDetector`: ZXing path) and an Android phone in the browser.
- Dropping QR: anyone scanning QR payloads in the web scanner loses that; the app never used them for
  products.
- Users who had chosen html5-qrcode lose nothing visible: their stored `wl_scanEngine` is simply ignored.
