<!--
  Smart Log modal — natural-language food logging via the AI Assistant.

  Voice input:
    - Native (Capacitor): @capacitor-community/speech-recognition (Android system recognizer)
    - PWA: Web Speech API (window.webkitSpeechRecognition)

  The user can also type. The AI parses both items AND the target meal slot
  ("for breakfast I had..."), so the user doesn't need to pick the meal manually.
-->
<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { _ } from 'svelte-i18n';
  import { closeOnBack } from '../../lib/back-stack.js';
  import { displayMealNames, energyUnit, smartLogVoiceLang } from '../../stores/settings.js';

  // Resolve the configured voice-input language. 'auto' (default) means
  // use the device locale; anything else is a BCP-47 tag the user picked
  // explicitly in Settings -> AI Assistant.
  function _resolveVoiceLang() {
    const v = smartLogVoiceLang.get();
    if (v && v !== 'auto') return v;
    return navigator.language || 'en-US';
  }
  import { Nutrition } from '../../lib/nutrition.js';
  import { amountAndUnit } from '../../lib/units.js';
  import { showError, showSuccess } from '../../stores/toast.js';
  import { parseInput, matchItems, saveItems, resolveMealSlot } from '../../lib/quick-log.js';
  import { API } from '../../lib/api.js';
  import { offNutritionStatus } from '../../lib/off-nutrition.js';
  // #241: an OFF match with no "as sold" values is shown but never logged
  // (saveItems skips it), so the Add button does not count it either.
  const _loggable = (m) => !!m.food && !(m.source === 'off' && offNutritionStatus(m.food, API.offNutritionInfo(m.food.barcode)) !== 'ok');
  import { isNative } from '../../lib/platform.js';
  import { localizeError } from '../../lib/server-errors.js';
  // Example phrases in the app language (also inserted into the input).
  $: _examples = [$_('smart_log.example_1'), $_('smart_log.example_2'), $_('smart_log.example_3')];

  export let date;                  // 'YYYY-MM-DD'
  export let defaultMealSlot = 0;   // index into mealNames (used if AI can't infer)
  export let openMode = 'text';     // 'text' | 'voice' | 'preParsed'
  // When openMode === 'preParsed', the caller has already run parseInput and
  // matched items via the Trace hold-to-record path. We skip the input/
  // parsing phases entirely and jump straight to the review modal.
  export let preParsedMatches = null;  // [{ item, candidates, best, source }, ...]
  export let preParsedMeal = null;     // string | null — AI-inferred meal name
  export let preParsedSourceText = ''; // for showing what the user said

  const dispatch = createEventDispatcher();

  let phase = 'input';              // 'input' | 'parsing' | 'review' | 'saving'
  let inputText = '';
  let inputEl;
  let listening = false;
  let voiceAvailable = false;       // true if voice can work in this environment
  let webRecognition = null;        // PWA fallback
  let parsedMeal = null;
  let matchedItems = [];
  let errorMsg = '';

  $: meals = $displayMealNames;

  onMount(async () => {
    // Pre-parsed mode: caller already ran parseInput + matchItems via the
    // Trace hold-to-record gesture. Jump straight to review.
    if (openMode === 'preParsed' && preParsedMatches && preParsedMatches.length > 0) {
      parsedMeal = preParsedMeal;
      inputText = preParsedSourceText || '';
      const resolvedSlot = resolveMealSlot(parsedMeal, meals);
      const slot = resolvedSlot != null ? resolvedSlot : defaultMealSlot;
      matchedItems = preParsedMatches.map(m => ({
        ...m,
        food: m.best || null,
        quantity: _defaultPortionFor(m),
        mealSlot: slot,
      }));
      phase = 'review';
      return;
    }

    setTimeout(() => inputEl?.focus(), 80);

    // Init voice input — native plugin first, then web fallback
    if (isNative) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        const { available } = await SpeechRecognition.available();
        voiceAvailable = !!available;
      } catch (e) {
        console.warn('[smart-log] native speech plugin unavailable:', e.message);
      }
    } else {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        webRecognition = new SR();
        webRecognition.continuous = false;
        webRecognition.interimResults = false;
        webRecognition.lang = _resolveVoiceLang();
        webRecognition.onresult = (e) => {
          const transcript = e.results[0]?.[0]?.transcript || '';
          if (transcript) inputText = (inputText ? inputText + ' ' : '') + transcript;
          listening = false;
        };
        webRecognition.onerror = (e) => {
          listening = false;
          showError($_('smart_log.voice_failed', { values: { error: e.error || $_('smart_log.unknown_error') } }));
        };
        webRecognition.onend = () => { listening = false; };
        voiceAvailable = true;
      }
    }

    // Auto-start mic if user opened in voice mode AND voice is available
    if (openMode === 'voice' && voiceAvailable) {
      setTimeout(() => toggleMic(), 150);
    }
  });

  onDestroy(async () => {
    // Make sure we don't leave the mic on
    if (listening) await stopListening();
    if (webRecognition) try { webRecognition.abort(); } catch {}
  });

  function close() { dispatch('close'); }

  async function toggleMic() {
    if (listening) {
      await stopListening();
    } else {
      await startListening();
    }
  }

  async function startListening() {
    if (!voiceAvailable) {
      showError($_('smart_log.voice_unavailable'));
      return;
    }
    if (isNative) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        // Check + request mic permission
        const perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
            showError($_('smart_log.mic_denied'));
            return;
          }
        }
        listening = true;
        const result = await SpeechRecognition.start({
          language: _resolveVoiceLang(),
          maxResults: 1,
          prompt: $_('smart_log.voice_prompt'),
          partialResults: false,
          popup: false,
        });
        listening = false;
        const transcript = (result?.matches && result.matches[0]) || '';
        if (transcript) {
          inputText = (inputText ? inputText + ' ' : '') + transcript;
          // Auto-submit when voice input completes — that's the whole point
          await runParse();
        }
      } catch (e) {
        listening = false;
        console.error('[smart-log] native voice failed:', e);
        showError($_('smart_log.voice_failed', { values: { error: e.message || $_('smart_log.unknown_error') } }));
      }
    } else if (webRecognition) {
      try {
        webRecognition.start();
        listening = true;
      } catch (e) {
        showError($_('smart_log.cant_start_mic', { values: { error: e.message } }));
      }
    }
  }

  async function stopListening() {
    if (isNative) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
      } catch {}
    } else if (webRecognition) {
      try { webRecognition.stop(); } catch {}
    }
    listening = false;
  }

  async function runParse() {
    errorMsg = '';
    if (!inputText.trim()) return;
    phase = 'parsing';
    try {
      const parsed = await parseInput(inputText, meals);
      parsedMeal = parsed.meal;
      if (!parsed.items || parsed.items.length === 0) {
        errorMsg = $_('smart_log.no_items');
        phase = 'input';
        return;
      }
      const matches = await matchItems(parsed.items);
      // Resolve the meal slot from the AI's interpretation, falling back to default
      const resolvedSlot = resolveMealSlot(parsedMeal, meals);
      const slot = resolvedSlot != null ? resolvedSlot : defaultMealSlot;
      matchedItems = matches.map(m => ({
        ...m,
        food: m.best || null,
        quantity: _defaultPortionFor(m),
        mealSlot: slot,
      }));
      phase = 'review';
    } catch (e) {
      console.error('[smart-log] parse failed:', e);
      errorMsg = e.message || $_('smart_log.parse_failed');
      phase = 'input';
    }
  }

  function _defaultPortionFor(m) {
    const food = m.best;
    if (!food) return 100;
    const basePortion = Number(food.portion) > 0 ? Number(food.portion) : 100;
    const qty = Number(m.item.quantity) > 0 ? Number(m.item.quantity) : 1;
    // If the AI parsed an explicit weight/volume unit (e.g. "100g", "250 ml"),
    // the quantity IS the portion size in grams. Use it directly. Otherwise
    // (no unit, "serving", "piece", "cup", etc.) the quantity is a count of
    // servings — multiply by the food's base portion.
    const unit = m.item.unit ? String(m.item.unit).toLowerCase().trim() : null;
    const isWeightOrVolume = unit === 'g' || unit === 'ml' || unit === 'gram' || unit === 'grams';
    if (isWeightOrVolume) return qty;
    return basePortion * qty;
  }

  function removeRow(i) {
    matchedItems = matchedItems.filter((_, idx) => idx !== i);
    if (matchedItems.length === 0) phase = 'input';
  }

  function swapCandidate(i, candidate) {
    const m = matchedItems[i];
    // Recalculate quantity using the new food's portion size
    const basePortion = Number(candidate.portion) > 0 ? Number(candidate.portion) : 100;
    const qty = Number(m.item.quantity) > 0 ? Number(m.item.quantity) : 1;
    const unit = m.item.unit ? String(m.item.unit).toLowerCase().trim() : null;
    const isWeightOrVolume = unit === 'g' || unit === 'ml' || unit === 'gram' || unit === 'grams';
    const newQuantity = isWeightOrVolume ? qty : basePortion * qty;
    matchedItems[i] = { ...m, food: candidate, quantity: newQuantity };
    matchedItems = matchedItems;
  }

  async function commitAll() {
    if (matchedItems.length === 0) return;
    phase = 'saving';
    try {
      const { saved } = await saveItems(matchedItems, { date, defaultMealSlot });
      if (saved > 0) {
        showSuccess($_('smart_log.logged', { values: { count: saved } }));
        dispatch('saved');
        dispatch('close');
      } else {
        errorMsg = $_('smart_log.nothing_saved');
        phase = 'review';
      }
    } catch (e) {
      console.error('[smart-log] save failed:', e);
      errorMsg = $_('smart_log.save_failed', { values: { error: localizeError(e.message) } });
      phase = 'review';
    }
  }

  function backToInput() {
    phase = 'input';
    matchedItems = [];
    parsedMeal = null;
    setTimeout(() => inputEl?.focus(), 80);
  }
</script>

<div class="ql-backdrop" transition:fade={{ duration: 150 }} on:click={close} use:closeOnBack={close}></div>
<div class="ql-sheet" transition:fly={{ y: 400, duration: 280 }}>
  <div class="ql-handle"></div>
  <div class="ql-header">
    <span class="material-symbols-rounded" style="color:var(--accent)">auto_awesome</span>
    <span class="ql-title">{$_('smart_log.title')}</span>
    <button class="btn-icon" on:click={close} aria-label={$_('common.close')} style="margin-left:auto">
      <span class="material-symbols-rounded">close</span>
    </button>
  </div>

  {#if phase === 'input'}
    <div class="ql-body">
      <p class="ql-hint">{$_('smart_log.hint')}</p>
      <div class="ql-input-row">
        <input
          bind:this={inputEl}
          bind:value={inputText}
          on:keydown={(e) => e.key === 'Enter' && runParse()}
          class="input ql-input"
          placeholder={$_('smart_log.placeholder')}
          autocomplete="off"
        />
        {#if voiceAvailable}
          <button class="btn-icon ql-mic" class:listening on:click={toggleMic} title={listening ? $_('smart_log.stop') : $_('smart_log.voice_input')}>
            <span class="material-symbols-rounded">{listening ? 'stop_circle' : 'mic'}</span>
          </button>
        {/if}
      </div>
      {#if listening}
        <div class="ql-listening-banner">
          <span class="material-symbols-rounded ql-pulse-icon">graphic_eq</span>
          {$_('smart_log.listening')}
        </div>
      {/if}
      {#if errorMsg}
        <div class="ql-error">{localizeError(errorMsg)}</div>
      {/if}
      <div class="ql-actions">
        <button class="btn btn-primary" on:click={runParse} disabled={!inputText.trim()}>
          <span class="material-symbols-rounded" style="font-size:16px">arrow_forward</span> {$_('smart_log.parse')}
        </button>
      </div>
      <div class="ql-examples">
        <div class="ql-example-label">{$_('smart_log.examples')}</div>
        {#each _examples as ex}
          <button class="ql-example" on:click={() => { inputText = ex; }}>{$_('smart_log.example_quoted', { values: { text: ex } })}</button>
        {/each}
      </div>
    </div>

  {:else if phase === 'parsing'}
    <div class="ql-body ql-loading">
      <span class="material-symbols-rounded ql-spin" style="font-size:32px;color:var(--accent)">autorenew</span>
      <p>{$_('smart_log.parsing', { values: { text: inputText } })}</p>
    </div>

  {:else if phase === 'review'}
    <div class="ql-body">
      <div class="ql-review-header">
        <button class="btn btn-secondary btn-sm" on:click={backToInput}>
          <span class="material-symbols-rounded" style="font-size:14px">arrow_back</span> {$_('smart_log.edit')}
        </button>
        <span class="ql-review-count">
          {$_('smart_log.items_count', { values: { count: matchedItems.length } })}
          {#if parsedMeal}· {$_('smart_log.detected')} <strong>{parsedMeal}</strong>{/if}
        </span>
      </div>
      <div class="ql-list">
        {#each matchedItems as m, i}
          {@const isExpansion = (m.source === 'meal' || m.source === 'yesterday') && m.food && Array.isArray(m.food.items)}
          {@const isWater = m.source === 'water'}
          <div class="ql-row" class:unmatched={!m.food}>
            <div class="ql-row-main">
              <div class="ql-row-name">
                {m.food?.name || m.item.name}
                {#if m.source === 'local'}<span class="ql-badge ql-badge-local">{$_('smart_log.badge_local')}</span>{/if}
                {#if m.source === 'off'}<span class="ql-badge ql-badge-off">OFF</span>{/if}
                {#if m.source === 'meal'}<span class="ql-badge ql-badge-meal">{$_('smart_log.badge_meal')}</span>{/if}
                {#if m.source === 'recipe'}<span class="ql-badge ql-badge-recipe">{$_('smart_log.badge_recipe')}</span>{/if}
                {#if m.source === 'yesterday'}<span class="ql-badge ql-badge-yesterday">{$_('smart_log.badge_yesterday')}</span>{/if}
                {#if isWater}<span class="ql-badge ql-badge-water">{$_('smart_log.badge_water')}</span>{/if}
                {#if !m.food}<span class="ql-badge ql-badge-warn">{$_('smart_log.badge_not_found')}</span>{/if}
              </div>
              {#if isWater && m.food}
                <div class="ql-row-meta">{$_('smart_log.water_meta', { values: { ml: m.food._waterMl } })}</div>
              {:else if m.food && isExpansion}
                <div class="ql-row-meta">
                  {$_('smart_log.expands_to', { values: { count: m.food.items.length } })}
                  {#if m.food.nutrition?.calories}
                    {@const _e = Nutrition.displayEnergy(m.food.nutrition.calories, $energyUnit)}
                    · {$_('smart_log.approx_total', { values: { value: _e.value.toLocaleString(), unit: _e.unit } })}
                  {/if}
                </div>
                <details class="ql-swap">
                  <summary>{$_('smart_log.show_items', { values: { count: m.food.items.length } })}</summary>
                  <div class="ql-candidates">
                    {#each m.food.items as sub}
                      <div class="ql-subitem">{sub.name}{sub.brand ? ' · ' + sub.brand : ''}</div>
                    {/each}
                  </div>
                </details>
              {:else if m.food && m.source === 'off' && offNutritionStatus(m.food, API.offNutritionInfo(m.food.barcode)) !== 'ok'}
                <!-- #241: not 0 kcal, just no "as sold" values on OFF. -->
                <div class="ql-row-meta">{$_('smart_log.off_no_values')}</div>
              {:else if m.food}
                {@const _kcal = (m.food.nutrition?.calories || 0) * (m.quantity / (m.food.portion || 100))}
                {@const _e2 = Nutrition.displayEnergy(_kcal, $energyUnit)}
                <div class="ql-row-meta">
                  {_e2.value.toLocaleString()} {_e2.unit} · {amountAndUnit(m.quantity, m.food.unit)}
                </div>
              {:else}
                <div class="ql-row-meta">{$_('smart_log.no_nutrition')}</div>
              {/if}
              {#if m.candidates && m.candidates.length > 1 && !isExpansion && !isWater}
                <details class="ql-swap">
                  <summary>{$_('smart_log.swap_match', { values: { count: m.candidates.length } })}</summary>
                  <div class="ql-candidates">
                    {#each m.candidates as c}
                      <button class="ql-candidate" class:active={c === m.food} on:click={() => swapCandidate(i, c)}>
                        {c.name}{c.brand ? ' · ' + c.brand : ''}
                      </button>
                    {/each}
                  </div>
                </details>
              {/if}
            </div>
            <div class="ql-row-controls">
              {#if !isWater}
                <select class="select sel-sm ql-meal-pick" bind:value={m.mealSlot}>
                  {#each meals as name, idx}
                    <option value={idx}>{name}</option>
                  {/each}
                </select>
              {/if}
              {#if !isExpansion && !isWater}
                <input type="number" class="input ql-qty" min="1" bind:value={m.quantity} />
              {/if}
              {#if isWater && m.food}
                <input type="number" class="input ql-qty" min="1" bind:value={m.food._waterMl} title={$_('smart_log.amount_ml')} />
              {/if}
              <button class="btn-icon" style="color:var(--danger)" on:click={() => removeRow(i)} aria-label={$_('smart_log.remove')}>
                <span class="material-symbols-rounded" style="font-size:18px">close</span>
              </button>
            </div>
          </div>
        {/each}
      </div>
      {#if errorMsg}
        <div class="ql-error">{localizeError(errorMsg)}</div>
      {/if}
      <div class="ql-actions">
        <button class="btn btn-primary" on:click={commitAll} disabled={matchedItems.filter(_loggable).length === 0}>
          <span class="material-symbols-rounded" style="font-size:16px">check</span>
          {$_('smart_log.add_to_diary', { values: { count: matchedItems.filter(_loggable).length } })}
        </button>
      </div>
    </div>

  {:else if phase === 'saving'}
    <div class="ql-body ql-loading">
      <span class="material-symbols-rounded ql-spin" style="font-size:32px;color:var(--accent)">autorenew</span>
      <p>{$_('common.saving')}</p>
    </div>
  {/if}
</div>

<style>
  .ql-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    z-index: 600;
  }
  .ql-sheet {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    background: var(--surface-1);
    border-top: 1px solid var(--border);
    border-radius: 20px 20px 0 0;
    z-index: 601;
    max-height: min(88vh, calc(100dvh - var(--safe-top) - 8px));
    display: flex;
    flex-direction: column;
    box-shadow: 0 -8px 40px rgba(0,0,0,0.45);
    padding-bottom: var(--safe-bottom, 0px);
  }
  @media (min-width: 769px) {
    .ql-sheet {
      left: 50%; right: auto; bottom: 24px;
      transform: translateX(-50%);
      width: 480px;
      max-height: 80vh;
      border-radius: 16px;
      border: 1px solid var(--border);
    }
  }
  .ql-handle {
    width: 40px; height: 4px;
    border-radius: 2px;
    background: var(--text-3);
    opacity: 0.4;
    margin: 8px auto 4px;
    flex-shrink: 0;
  }
  .ql-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .ql-title { font-size: 16px; font-weight: 700; color: var(--text-1); }

  .ql-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ql-hint { font-size: 13px; color: var(--text-3); margin: 0; }

  .ql-input-row { display: flex; gap: 8px; align-items: center; }
  .ql-input { flex: 1; height: 44px; font-size: 15px; }
  .ql-mic {
    width: 44px; height: 44px;
    background: var(--surface-2);
    border-radius: 50%;
  }
  .ql-mic.listening {
    background: var(--accent-dim);
    color: var(--accent);
    animation: ql-pulse 1.4s ease-in-out infinite;
  }
  @keyframes ql-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  .ql-listening-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--accent-dim);
    color: var(--accent);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .ql-pulse-icon { animation: ql-pulse 0.9s ease-in-out infinite; }

  .ql-error {
    color: var(--danger);
    font-size: 13px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--danger) 10%, transparent);
    border-radius: 6px;
  }

  .ql-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .ql-examples {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-top: 8px;
  }
  .ql-example-label {
    width: 100%;
    font-size: 11px;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .ql-example {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    padding: 6px 10px;
    border-radius: 14px;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }
  .ql-example:hover { background: var(--accent-dim); color: var(--accent); }

  .ql-loading {
    align-items: center;
    text-align: center;
    padding: 40px 16px;
    color: var(--text-3);
  }
  .ql-spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .ql-review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ql-review-count { font-size: 13px; color: var(--text-3); }

  .ql-list { display: flex; flex-direction: column; gap: 8px; }
  .ql-row {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ql-row.unmatched { border-color: var(--warning, #f59e0b); }
  .ql-row-main { display: flex; flex-direction: column; gap: 2px; }
  .ql-row-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-1);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .ql-row-meta { font-size: 12px; color: var(--text-3); }

  .ql-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }
  .ql-badge-local     { background: var(--accent-dim); color: var(--accent); }
  .ql-badge-off       { background: color-mix(in srgb, #3b82f6 20%, transparent); color: #60a5fa; }
  .ql-badge-meal      { background: color-mix(in srgb, #a855f7 20%, transparent); color: #c084fc; }
  .ql-badge-recipe    { background: color-mix(in srgb, #ec4899 20%, transparent); color: #f472b6; }
  .ql-badge-yesterday { background: color-mix(in srgb, #10b981 20%, transparent); color: #34d399; }
  .ql-badge-water     { background: color-mix(in srgb, #38bdf8 20%, transparent); color: #38bdf8; }
  .ql-badge-warn      { background: color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent); color: var(--warning, #f59e0b); }
  .ql-subitem {
    font-size: 12px;
    color: var(--text-2);
    padding: 3px 8px;
  }

  .ql-swap summary {
    font-size: 11px;
    color: var(--text-3);
    cursor: pointer;
    margin-top: 4px;
  }
  .ql-candidates {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
    padding-left: 8px;
  }
  .ql-candidate {
    text-align: left;
    background: var(--surface-1);
    border: 1px solid var(--border);
    color: var(--text-2);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }
  .ql-candidate.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }

  .ql-row-controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .ql-meal-pick { flex: 1; min-width: 0; }
  .ql-qty {
    width: 64px;
    height: 32px;
    text-align: center;
    font-size: 13px;
  }
</style>
