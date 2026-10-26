<script>
  import { closeOnBack } from '../../lib/back-stack.js';
  import { onDestroy, createEventDispatcher, tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { _ } from 'svelte-i18n';
  import { isNative } from '../../lib/platform.js';

  // Portal to document.body — prevents position:fixed being trapped by
  // ancestor transforms or opacity transitions (common iOS issue)
  function modalPortal(node) {
    document.body.appendChild(node);
    document.body.style.overflow = 'hidden';
    return {
      destroy() {
        node.remove();
        document.body.style.overflow = '';
      }
    };
  }
  import { barcodeBeep, barcodeFlashlight } from '../../stores/settings.js';
  import { createConfirmer, decodersForTick, checkDigitOk, PRODUCT_FORMATS } from '../../lib/barcode-scan.js';
  import { createDecoders, decodeImage } from '../../lib/barcode-decoders.js';

  export let open = false;

  const dispatch = createEventDispatcher();

  // Web scanner: one camera stream shown in <video>, its frames handed to
  // the decoders best first (barcode-decoders.js), on the schedule and with
  // the read checks of barcode-scan.js. The user only aims the camera.
  let videoEl;
  let stream = null;
  let detected = false;
  let selectedCamId  = localStorage.getItem('wl_scanCamId')  || '';
  let cameras = [];
  let status = 'barcode_scanner.status.starting';   // i18n key of the status pill
  let torchVisible = false;
  let torchOn = false;
  let manualCode = '';
  let scanlineVisible = false;
  let scanning = false;
  let _decoders = null;        // Promise of the decoder list, made once per open
  let _run = 0;                // bumped on every camera (re)start; a stale loop stops
  let photoInput;
  let readingPhoto = false;

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = 1046;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
  }

  function stopStream() {
    _run++;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    if (videoEl) videoEl.srcObject = null;
  }

  async function close() {
    detected = true;
    scanning = false;
    stopStream();
    dispatch('close');
  }

  async function onCode(code) {
    if (detected) return;
    detected = true;
    if ($barcodeBeep) playBeep();
    scanlineVisible = true;
    setTimeout(() => scanlineVisible = false, 500);
    await close();
    dispatch('scan', { code });
  }

  async function startCamera() {
    stopStream();
    const run = _run;
    status = 'barcode_scanner.status.starting';
    torchVisible = false;
    torchOn = false;
    const video = { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (selectedCamId) video.deviceId = { exact: selectedCamId };
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ video });
    } catch (e) {
      if (run !== _run) return;
      // A remembered camera that is gone: forget it and take the rear one.
      if (selectedCamId && (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError')) {
        selectedCamId = '';
        localStorage.removeItem('wl_scanCamId');
        return startCamera();
      }
      status = e?.name === 'NotAllowedError' ? 'barcode_scanner.status.denied'
        : e?.name === 'NotFoundError' ? 'barcode_scanner.status.no_camera' : 'barcode_scanner.status.error';
      return;
    }
    if (run !== _run || detected || !videoEl) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    videoEl.srcObject = s;
    await videoEl.play().catch(() => {});
    const track = s.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
      if ('torch' in caps) {
        torchVisible = true;
        if ($barcodeFlashlight) {
          torchOn = true;
          track.applyConstraints({ advanced: [{ torch: true }] }).catch(() => {});
        }
      }
    } catch(e) {}
    try {
      cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    } catch { cameras = []; }
    const camId = track.getSettings ? track.getSettings().deviceId : '';
    if (camId) { selectedCamId = camId; localStorage.setItem('wl_scanCamId', camId); }
    if (run !== _run) return;
    status = 'barcode_scanner.status.align';
    _decodeLoop(run);
  }

  // Ticks ~100 ms apart, never two decodes at once. A decoder that keeps
  // failing (script would not load, API missing) is dropped for this open.
  async function _decodeLoop(run) {
    let decoders = await _decoders;
    const confirmer = createConfirmer();
    const errors = new Map();
    const t0 = performance.now();
    for (let n = 0; run === _run && !detected; n++) {
      if (videoEl && videoEl.readyState >= 2) {
        for (const id of decodersForTick(decoders.map(d => d.id), n, performance.now() - t0)) {
          const d = decoders.find(x => x.id === id);
          let r = null;
          try {
            r = await d.decode(videoEl);
            errors.delete(id);
          } catch (e) {
            errors.set(id, (errors.get(id) || 0) + 1);
            if (errors.get(id) >= 3) {
              console.warn('[BarcodeScanner] ' + id + ' dropped:', e);
              decoders = decoders.filter(x => x !== d);
            }
          }
          if (run !== _run || detected) return;
          const code = r && confirmer.offer({ ...r, decoder: id });
          if (code) return onCode(code);
        }
      }
      await new Promise(res => setTimeout(res, 100));
    }
  }

  async function toggleTorch() {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return;
    torchOn = !torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch(e) {}
  }

  function switchCamera() {
    if (cameras.length < 2) return;
    const i = cameras.findIndex(c => c.deviceId === selectedCamId);
    selectedCamId = cameras[(i + 1) % cameras.length].deviceId;
    localStorage.setItem('wl_scanCamId', selectedCamId);
    startCamera();
  }

  // A photo picked from the gallery (or taken by the phone's own camera app)
  // instead of the live preview. The preview keeps scanning meanwhile.
  async function onPhotoPicked(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || readingPhoto || detected) return;
    readingPhoto = true;
    status = 'barcode_scanner.status.reading_photo';
    let code = null;
    try { code = await decodeImage(file); } catch { code = null; }
    readingPhoto = false;
    if (detected) return;
    if (code) return onCode(code);
    status = 'barcode_scanner.photo_none';
  }

  async function doManual() {
    if (detected) return;
    const code = manualCode.trim();
    if (!code) return;
    detected = true;
    await close();
    dispatch('scan', { code });
  }

  async function startScanner() {
    detected = false;
    scanning = true;
    status = 'barcode_scanner.status.starting';
    _decoders = createDecoders();
    await tick();   // the <video> is in the page once `open` has rendered
    startCamera();
  }

  // Native mode: use ML Kit bundled scanner. Runs camera BEHIND the
  // WebView (`startScan` API); we render our own overlay UI on top.
  // Critically, this path does NOT call the Google Code Scanner module
  // — no Google Play Services runtime dependency. Works on degoogled
  // ROMs (GrapheneOS, /e/, CalyxOS, etc.). Fixes #31.
  let _nativeListener = null;
  let _nativeBarcodeScannerRef = null;
  let nativeScannerActive = false;
  let nativeStatus = 'Starting camera…';
  let nativeTorchOn = false;

  async function startNativeScanner() {
    detected = false;  // reset detected guard so re-opening after a prior scan works
    scanning = true;
    nativeStatus = 'Requesting camera…';
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
      _nativeBarcodeScannerRef = BarcodeScanner;

      const perms = await BarcodeScanner.requestPermissions();
      if (perms.camera !== 'granted') {
        const { showError } = await import('../../stores/toast.js');
        showError($_('barcode_scanner.toast.cam_denied'));
        open = false; scanning = false;
        return;
      }

      // Make the WebView and everything else transparent so the camera
      // (behind the WebView) is visible. Class hooks into CSS at the
      // bottom of this file. App-wide global CSS opt-in is in main.js.
      document.body.classList.add('barcode-scanner-active');
      nativeScannerActive = true;
      nativeStatus = 'Align Barcode';

      _nativeListener = await BarcodeScanner.addListener('barcodeScanned', (event) => {
        const code = event?.barcode?.rawValue;
        if (!code) return;
        if (detected) return;
        detected = true;
        if ($barcodeBeep) playBeep();
        scanlineVisible = true;
        setTimeout(() => scanlineVisible = false, 500);
        // Set open=false FIRST. Don't call stopNativeScanner directly here.
        // If we did, scanning=false would fire BEFORE open=false, and the
        // reactive `$: if (open && !scanning) startNativeScanner()` would
        // re-fire during the await window inside stopNativeScanner —
        // because at that moment open is still true and scanning is now
        // false. That re-opens the scanner in a loop until CameraX hits
        // its surface-combination limit ("No supported surface combination
        // is found ... May be attempting to bind too many use cases").
        // The reactive `$: if (!open && scanning) stopNativeScanner()`
        // handles cleanup correctly once open=false propagates.
        open = false;
        dispatch('scan', { code });
      });

      await BarcodeScanner.startScan();

      // Auto-enable torch if the setting requests it
      if ($barcodeFlashlight) {
        try { await BarcodeScanner.enableTorch(); nativeTorchOn = true; } catch {}
      }
    } catch (e) {
      console.error('[BarcodeScanner] Native scan failed:', e);
      const { showError } = await import('../../stores/toast.js');
      showError($_('barcode_scanner.toast.scan_failed', { values: { error: e?.message || $_('barcode_scanner.toast.unknown_error') } }));
      await stopNativeScanner();
      open = false;
    }
  }

  async function stopNativeScanner() {
    scanning = false;
    nativeScannerActive = false;
    document.body.classList.remove('barcode-scanner-active');
    if (_nativeListener) {
      try { await _nativeListener.remove(); } catch {}
      _nativeListener = null;
    }
    if (_nativeBarcodeScannerRef) {
      try { await _nativeBarcodeScannerRef.stopScan(); } catch {}
    }
  }

  async function toggleNativeTorch() {
    if (!_nativeBarcodeScannerRef) return;
    try {
      if (nativeTorchOn) {
        await _nativeBarcodeScannerRef.disableTorch();
        nativeTorchOn = false;
      } else {
        await _nativeBarcodeScannerRef.enableTorch();
        nativeTorchOn = true;
      }
    } catch {}
  }

  // Android: a photo from the gallery, read by ML Kit. The live scan is
  // paused while the picker is open and resumed when nothing was found.
  async function nativeFromPhoto() {
    if (detected || readingPhoto || !_nativeBarcodeScannerRef) return;
    readingPhoto = true;
    let code = null;
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      try { await _nativeBarcodeScannerRef.stopScan(); } catch {}
      const photo = await Camera.getPhoto({ source: CameraSource.Photos, resultType: CameraResultType.Uri, quality: 100 });
      const { barcodes } = await _nativeBarcodeScannerRef.readBarcodesFromImage({
        path: photo.path,
        formats: PRODUCT_FORMATS.map(f => f.toUpperCase()),
      });
      const hit = (barcodes || []).find(b => b.rawValue && checkDigitOk(b.rawValue, String(b.format || '').toLowerCase()));
      code = hit ? hit.rawValue : null;
      if (!code) {
        const { showError } = await import('../../stores/toast.js');
        showError($_('barcode_scanner.photo_none'));
      }
    } catch (e) {
      // Closing the picker without a photo lands here; nothing to say.
      console.warn('[BarcodeScanner] photo:', e?.message || e);
    } finally {
      readingPhoto = false;
    }
    if (code) {
      if (detected) return;
      detected = true;
      if ($barcodeBeep) playBeep();
      open = false;
      dispatch('scan', { code });
      return;
    }
    if (open && !detected) { try { await _nativeBarcodeScannerRef.startScan(); } catch {} }
  }

  function closeNative() {
    // Same ordering rule as the scan listener: open=false first so the
    // reactive cleans up. Avoids the re-open loop.
    open = false;
    dispatch('close');
  }

  function doManualNative() {
    if (detected) return;
    const code = manualCode.trim();
    if (!code) return;
    detected = true;
    open = false;
    dispatch('scan', { code });
  }

  $: if (open && !scanning) {
    if (isNative) startNativeScanner();
    else startScanner();
  }
  $: if (!open && scanning) {
    if (isNative) stopNativeScanner();
    else close();
  }

  onDestroy(() => {
    detected = true;
    if (isNative) stopNativeScanner();
    else stopStream();
  });
</script>

{#if open && isNative && nativeScannerActive}
  <!-- Native scanner overlay. The actual camera renders BEHIND the
       WebView (ML Kit handles it); we just draw the UI on top, with
       body+root made transparent via .barcode-scanner-active. Portal
       to <body> so the visibility-hide CSS rule (which hides every
       body child except this overlay) doesn't sweep us up with #app. -->
  <div class="native-scanner-overlay" use:modalPortal use:closeOnBack={closeNative}>
    <div class="ns-top">
      <button class="btn-icon ns-close" on:click={closeNative} aria-label={$_('barcode_scanner.close')} title={$_('barcode_scanner.close')}>
        <span class="material-symbols-rounded">close</span>
      </button>
      <div class="ns-status">{nativeStatus}</div>
      <button class="btn-icon ns-torch" class:active={nativeTorchOn} on:click={toggleNativeTorch} aria-label={$_('barcode_scanner.torch')} title={$_('barcode_scanner.torch')}>
        <span class="material-symbols-rounded">{nativeTorchOn ? 'flash_on' : 'flash_off'}</span>
      </button>
    </div>

    <div class="ns-aim">
      <div class="ns-aim-box">
        <div class="aim-corner tl"></div>
        <div class="aim-corner tr"></div>
        <div class="aim-corner bl"></div>
        <div class="aim-corner br"></div>
        {#if scanlineVisible}
          <div class="aim-scanline"></div>
        {/if}
      </div>
    </div>

    <div class="ns-bottom">
      <button class="sc-btn" on:click={nativeFromPhoto} disabled={readingPhoto}>
        <span class="material-symbols-rounded">photo_library</span>
        {$_('barcode_scanner.from_photo')}
      </button>
      <div class="ns-manual">
        <input
          class="input"
          type="text"
          placeholder={$_('barcode_scanner.manual_ph')}
          bind:value={manualCode}
          on:keydown={e => e.key === 'Enter' && doManualNative()}
        />
        <button class="btn btn-primary" on:click={doManualNative}>{$_('barcode_scanner.lookup')}</button>
      </div>
    </div>
  </div>
{/if}

{#if open && !isNative}
  <div class="scanner-backdrop" use:modalPortal on:click={close} transition:fly={{ y: 20, duration: 220 }}>
    <div class="scanner-panel" on:click|stopPropagation>
      <!-- Header -->
      <div class="scanner-header">
        <span class="scanner-title">{$_('barcode_scanner.title')}</span>
        <button class="btn-icon" on:click={close} aria-label={$_('barcode_scanner.close_short')} title={$_('barcode_scanner.close')}>
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>

      <!-- Viewport -->
      <div class="scanner-viewport">
        <div class="scanner-feed">
          <!-- svelte-ignore a11y-media-has-caption -->
          <video class="scanner-video" bind:this={videoEl} playsinline muted autoplay></video>
        </div>
        <!-- Aim guide -->
        <div class="scanner-aim" aria-hidden="true">
          <div class="aim-box">
            <div class="aim-corner tl"></div>
            <div class="aim-corner tr"></div>
            <div class="aim-corner bl"></div>
            <div class="aim-corner br"></div>
            {#if scanlineVisible}
              <div class="aim-scanline"></div>
            {/if}
          </div>
        </div>
        <!-- Status pill -->
        <div class="scanner-status-pill">{$_(status)}</div>
      </div>

      <!-- Action buttons -->
      <div class="scanner-actions">
        <button class="sc-btn" on:click={startCamera}>
          <span class="material-symbols-rounded">refresh</span>
          {$_('barcode_scanner.refresh')}
        </button>
        {#if torchVisible}
          <button class="sc-btn" class:sc-btn-torch={torchOn} on:click={toggleTorch}>
            <span class="material-symbols-rounded">{torchOn ? 'flash_on' : 'flash_off'}</span>
            {torchOn ? $_('barcode_scanner.flash_on') : $_('barcode_scanner.flash_off')}
          </button>
        {/if}
        {#if cameras.length > 1}
          <button class="sc-btn" on:click={switchCamera}>
            <span class="material-symbols-rounded">cameraswitch</span>
            {$_('barcode_scanner.switch_camera')}
          </button>
        {/if}
        <button class="sc-btn" on:click={() => photoInput.click()} disabled={readingPhoto}>
          <span class="material-symbols-rounded">photo_library</span>
          {$_('barcode_scanner.from_photo')}
        </button>
        <input type="file" accept="image/*" hidden bind:this={photoInput} on:change={onPhotoPicked} />
      </div>

      <!-- Manual entry -->
      <div class="scanner-manual">
        <input
          class="input"
          type="text"
          placeholder={$_('barcode_scanner.manual_ph')}
          bind:value={manualCode}
          on:keydown={e => e.key === 'Enter' && doManual()}
        />
        <button class="btn btn-primary" on:click={doManual}>{$_('barcode_scanner.lookup')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scanner-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0,0,0,0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    padding: 16px;
  }

  .scanner-panel {
    width: 100%;
    max-width: 440px;
    max-height: min(calc(100dvh - 32px), calc(100dvh - 2 * var(--safe-top) - 16px));
    background: var(--surface-1);
    border-radius: var(--radius-xl);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  }

  .scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .scanner-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-1);
  }

  .scanner-viewport {
    position: relative;
    width: 100%;
    height: 260px;
    background: #000;
    flex-shrink: 0;
    overflow: hidden;
  }
  .scanner-feed {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .scanner-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .scanner-aim {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 5;
  }
  .aim-box {
    position: relative;
    width: 68%;
    max-width: 260px;
    aspect-ratio: 2.2/1;
    border: 2px dashed rgba(255,255,255,0.4);
    border-radius: 4px;
    overflow: hidden;
  }
  .aim-scanline {
    position: absolute;
    left: 0; right: 0; height: 3px;
    background: var(--accent);
    top: 45%;
    box-shadow: 0 0 8px var(--accent);
  }
  .aim-corner {
    position: absolute;
    width: 16px; height: 16px;
  }
  .aim-corner.tl { top: -3px; left: -3px; border-top: 3px solid var(--accent); border-left: 3px solid var(--accent); }
  .aim-corner.tr { top: -3px; right: -3px; border-top: 3px solid var(--accent); border-right: 3px solid var(--accent); }
  .aim-corner.bl { bottom: -3px; left: -3px; border-bottom: 3px solid var(--accent); border-left: 3px solid var(--accent); }
  .aim-corner.br { bottom: -3px; right: -3px; border-bottom: 3px solid var(--accent); border-right: 3px solid var(--accent); }

  .scanner-status-pill {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    pointer-events: none;
    font-size: 11px;
    color: #fff;
    background: rgba(0,0,0,0.65);
    padding: 3px 10px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .scanner-actions {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
    flex-shrink: 0;
  }
  .sc-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
    background: var(--surface-1);
    color: var(--text-2);
    white-space: nowrap;
    transition: background var(--dur-fast), color var(--dur-fast);
  }
  .sc-btn .material-symbols-rounded { font-size: 14px; }
  .sc-btn.sc-btn-active { background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); border-color: var(--accent); }
  .sc-btn.sc-btn-torch  { background: color-mix(in srgb, #fbbf24 20%, transparent); color: #fbbf24; border-color: #fbbf24; }

  .scanner-manual {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    align-items: center;
  }
  .scanner-manual .input { flex: 1; }
  .scanner-manual .btn { flex-shrink: 0; white-space: nowrap; }

  /* Native ML Kit scanner overlay (bundled, no Play Services) — camera
     renders BEHIND the WebView. We just draw chrome on top. */
  .native-scanner-overlay {
    position: fixed;
    inset: 0;
    z-index: 250;
    display: flex;
    flex-direction: column;
    pointer-events: none;
  }
  .native-scanner-overlay > * { pointer-events: auto; }

  .ns-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(var(--safe-top) + 12px) 16px 12px;
    gap: 8px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.55), transparent);
  }
  .ns-close, .ns-torch {
    background: rgba(0,0,0,0.5);
    color: #fff;
    border-radius: 50%;
    width: 40px;
    height: 40px;
  }
  .ns-torch.active { background: rgba(251,191,36,0.85); color: #000; }
  .ns-status {
    flex: 1;
    text-align: center;
    color: #fff;
    background: rgba(0,0,0,0.55);
    border-radius: 14px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    margin: 0 8px;
    max-width: 220px;
    justify-self: center;
  }

  .ns-aim {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .ns-aim-box {
    position: relative;
    width: 78%;
    max-width: 320px;
    aspect-ratio: 2.2/1;
    border: 2px dashed rgba(255,255,255,0.5);
    border-radius: 6px;
  }
  .ns-aim-box .aim-corner.tl { top: -3px; left: -3px; border-top: 3px solid var(--accent); border-left: 3px solid var(--accent); }
  .ns-aim-box .aim-corner.tr { top: -3px; right: -3px; border-top: 3px solid var(--accent); border-right: 3px solid var(--accent); }
  .ns-aim-box .aim-corner.bl { bottom: -3px; left: -3px; border-bottom: 3px solid var(--accent); border-left: 3px solid var(--accent); }
  .ns-aim-box .aim-corner.br { bottom: -3px; right: -3px; border-bottom: 3px solid var(--accent); border-right: 3px solid var(--accent); }

  .ns-bottom {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 16px calc(var(--safe-bottom) + 20px);
    background: linear-gradient(to top, rgba(0,0,0,0.65), transparent);
  }
  .ns-bottom .sc-btn {
    align-self: center;
    background: rgba(0,0,0,0.6);
    color: #fff;
    border-color: rgba(255,255,255,0.2);
  }
  .ns-bottom .sc-btn.sc-btn-active {
    background: color-mix(in srgb, var(--accent) 80%, transparent);
    color: #fff;
    border-color: var(--accent);
  }
  .ns-manual {
    display: flex;
    gap: 8px;
    background: rgba(0,0,0,0.55);
    border-radius: var(--radius-md);
    padding: 8px;
    align-items: center;
  }
  .ns-manual .input { flex: 1; background: rgba(255,255,255,0.92); color: #000; }
  .ns-manual .btn { flex-shrink: 0; white-space: nowrap; }
</style>
