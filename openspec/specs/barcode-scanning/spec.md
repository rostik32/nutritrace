# barcode-scanning Specification

## Purpose
Lets a user scan a product barcode by pointing the camera at it (web/PWA) or by picking a photo (web and
Android app), without choosing how it is decoded.

## Requirements

### Requirement: No decoder choice
The web barcode scanner SHALL NOT ask the user to choose a decoding library. It SHALL open the remembered
camera, or the rear camera when none is remembered, as soon as it opens. A control to switch cameras SHALL
be shown only when the device has more than one camera, and the chosen camera SHALL be remembered on the
device.

#### Scenario: Open the scanner
- **WHEN** the user taps the scan button in the browser
- **THEN** the camera preview starts and the scanner decodes without any library or camera select

#### Scenario: Phone with several cameras
- **WHEN** the device reports two or more cameras
- **THEN** a switch-camera button is shown, and the camera picked with it is used the next time

### Requirement: Best decoder first on one camera stream
The scanner SHALL decode frames of a single camera stream with the browser's built-in barcode detector
when available, otherwise with ZXing. When no code has been read for 1.5 s, the next decoder (ZXing after
the built-in detector, then Quagga2) SHALL also be tried on the same stream, without restarting the camera.

#### Scenario: Browser with a built-in detector
- **WHEN** `BarcodeDetector` exists and the barcode is readable
- **THEN** the code is read by the built-in detector and the ZXing / Quagga2 scripts are not loaded

#### Scenario: Built-in detector cannot read it
- **WHEN** the built-in detector reads nothing for 1.5 s
- **THEN** ZXing is also tried on the same frames, and from 3 s Quagga2, with the preview never restarting

#### Scenario: Browser without a built-in detector
- **WHEN** `BarcodeDetector` does not exist (e.g. iPhone Safari)
- **THEN** ZXing decodes from the start and Quagga2 joins after 1.5 s without a result

### Requirement: Product barcodes only, checked before use
The scanner SHALL decode EAN-13, EAN-8, UPC-A, UPC-E and Code 128 only. An EAN or UPC code whose check
digit is wrong SHALL be ignored. A code from the built-in detector or ZXing with a valid check digit SHALL
be accepted at once; any other code SHALL be accepted only after the same value is read twice within
1.5 s.

#### Scenario: Valid EAN-13
- **WHEN** ZXing reads `4006381333931`
- **THEN** the scanner closes and reports that code

#### Scenario: Misread
- **WHEN** Quagga2 reads `4006381333932` (wrong check digit)
- **THEN** nothing is reported and scanning continues

#### Scenario: Quagga2 read
- **WHEN** Quagga2 reads a code with a valid check digit once
- **THEN** it is reported only after a second identical read within 1.5 s

#### Scenario: QR code next to the barcode
- **WHEN** a QR code is in view
- **THEN** it is not reported

### Requirement: Scan from a photo
The scanner SHALL offer a "From Photo" action that reads a product barcode from a picture the user picks,
with the same formats and check-digit rule as the live scan, and report it like a live read. When no
barcode is found it SHALL say so and keep the scanner open.

#### Scenario: Photo with a barcode
- **WHEN** the user picks a photo of a package whose EAN-13 is readable
- **THEN** the scanner closes and reports that code

#### Scenario: Photo without a barcode
- **WHEN** the picked photo has no readable product barcode
- **THEN** the scanner shows "No barcode found in the photo" and stays open
