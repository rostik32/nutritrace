<script>
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import Toggle from '../../components/settings/Toggle.svelte';
  import ConnectionStatus from '../../components/settings/ConnectionStatus.svelte';
  import { DB } from '../../lib/db.js';
  import { NtApi } from '../../lib/api.js';
  import { isNative, getServerUrl, getAuthToken, apiUrl } from '../../lib/platform.js';
  import { showSuccess, showError } from '../../stores/toast.js';
  import { envLocks, scheduleSave } from '../../stores/settings.js';
  import { currentUser } from '../../stores/auth.js';
  import { parseOffLanguages, serializeOffLanguages } from '../../lib/off-languages.js';
  import { intlLocale } from '../../i18n/index.js';
  import { localizeError } from '../../lib/server-errors.js';

  function set(key, value) { DB.setSetting(key, value); scheduleSave(key, value); }

  function _fetchOpts(extra = {}) {
    const h = { ...extra };
    if (isNative && getServerUrl()) {
      const t = getAuthToken();
      if (t) h['Authorization'] = `Bearer ${t}`;
    } else {
      const csrf = localStorage.getItem('nt:csrf');
      if (csrf) h['X-CSRF-Token'] = csrf;
    }
    return { credentials: 'include', headers: h };
  }

  // ── OFF ────────────────────────────────────────────────────────────────
  let offUsername   = DB.getSetting('offUsername',   '');
  let offPassword   = DB.getSetting('offPassword',   '');
  let offShowPass   = false;
  let offEnabled    = DB.getSetting('offEnabled',    true);

  const OFF_LANGUAGE_OPTS = [
    ['en','English'],['fr','French'],['de','German'],['es','Spanish'],['it','Italian'],
    ['pt','Portuguese'],['nl','Dutch'],['pl','Polish'],['ru','Russian'],['uk','Ukrainian'],
    ['cs','Czech'],['ja','Japanese'],['zh','Chinese'],['ar','Arabic'],['ko','Korean']
  ];
  // Alphabetized (World stays first as the "no filter" default). Kept
  // aligned with the OFF regions where user demand actually shows up:
  // Anglosphere, Western Europe + Nordics, Central/Eastern Europe,
  // LATAM, APAC, and SA. Adding new entries: keep alphabetical order
  // and confirm the country has a corresponding en:<slug> tag on
  // openfoodfacts.org before shipping.
  const OFF_COUNTRY_OPTS = ['World',
    'Argentina','Australia','Austria','Belgium','Brazil','Canada','Chile','China',
    'Czech Republic','Denmark','Finland','France','Germany','India','Ireland','Italy','Japan',
    'Mexico','Netherlands','New Zealand','Norway','Poland','Portugal','Singapore',
    'South Africa','South Korea','Spain','Sweden','Switzerland','Ukraine','United Kingdom',
    'United States'];
  const _OFF_COUNTRY_CODES = {
    'Argentina':'AR','Australia':'AU','Austria':'AT','Belgium':'BE','Brazil':'BR','Canada':'CA','Chile':'CL','China':'CN',
    'Czech Republic':'CZ','Denmark':'DK','Finland':'FI','France':'FR','Germany':'DE','India':'IN','Ireland':'IE','Italy':'IT','Japan':'JP',
    'Mexico':'MX','Netherlands':'NL','New Zealand':'NZ','Norway':'NO','Poland':'PL','Portugal':'PT','Singapore':'SG',
    'South Africa':'ZA','South Korea':'KR','Spain':'ES','Sweden':'SE','Switzerland':'CH','Ukraine':'UA','United Kingdom':'GB',
    'United States':'US',
  };
  // Display labels follow the app language; English keeps the original names.
  function _offLangLabel(code, fallback) {
    const loc = intlLocale();
    if (/^en\b/.test(loc)) return fallback;
    try { const n = new Intl.DisplayNames([loc], { type: 'language' }).of(code); return n ? n.charAt(0).toLocaleUpperCase(loc) + n.slice(1) : fallback; } catch { return fallback; }
  }
  function _offCountryLabel(name) {
    if (name === 'World') return $_('settings.connected_services.off.country_world');
    const loc = intlLocale();
    const code = _OFF_COUNTRY_CODES[name];
    if (!code || /^en\b/.test(loc)) return name;
    try { return new Intl.DisplayNames([loc], { type: 'region' }).of(code) || name; } catch { return name; }
  }
  // Stored as an ordered list "uk,ru,cs": the primary language first, then the
  // extra languages searched alongside it (see lib/off-languages.js).
  const _offLangs = parseOffLanguages(DB.getSetting('offSearchLanguage', 'en'));
  let offPrimaryLang = _offLangs[0];
  let offExtraLangs = _offLangs.slice(1);
  $: offSearchLanguage = serializeOffLanguages([offPrimaryLang, ...offExtraLangs.filter(l => l !== offPrimaryLang)]);
  function toggleOffExtraLang(code) {
    offExtraLangs = offExtraLangs.includes(code)
      ? offExtraLangs.filter(l => l !== code)
      : OFF_LANGUAGE_OPTS.map(([v]) => v).filter(v => v === code || offExtraLangs.includes(v));
  }
  let offSearchCountry  = DB.getSetting('offSearchCountry',  'World');
  let offUploadCountry  = DB.getSetting('offUploadCountry',  'Auto');
  let offImportPortion  = DB.getSetting('offImportPortion',  'per100g');

  $: set('offEnabled',        offEnabled);
  $: set('offSearchLanguage', offSearchLanguage);
  $: set('offSearchCountry',  offSearchCountry);
  $: set('offUploadCountry',  offUploadCountry);
  $: set('offImportPortion',  offImportPortion);

  let offSaved    = false;
  function saveOff() {
    set('offUsername', offUsername);
    set('offPassword', offPassword);
    offSaved = true;
    setTimeout(() => offSaved = false, 2000);
  }

  // ── USDA ───────────────────────────────────────────────────────────────
  let usdaApiKey  = DB.getSetting('usdaApiKey', '');
  let usdaEnabled = DB.getSetting('usdaEnabled', false);
  let usdaSaved   = false;
  let usdaTestStatus = ''; // '', 'testing', 'ok', 'fail'
  $: set('usdaEnabled', usdaEnabled);
  $: usdaBannerStatus = (usdaTestStatus === 'testing' || usdaTestStatus === 'fail')
    ? usdaTestStatus
    : (usdaApiKey ? 'ok' : '');

  async function testUsdaConnection() {
    if (!usdaApiKey) { usdaTestStatus = 'fail'; showError($_('settings.connected_services.usda.key_required')); return; }
    usdaTestStatus = 'testing';
    try {
      // Direct call — USDA's FoodData Central API has open CORS, so the
      // browser can hit it without a server proxy. A 1-result probe query
      // is enough to verify the key.
      const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(usdaApiKey)}&query=apple&pageSize=1`;
      const res = await fetch(url);
      if (res.ok) {
        usdaTestStatus = 'ok';
        showSuccess($_('settings.connected_services.usda.verified'));
      } else {
        usdaTestStatus = 'fail';
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error?.message) detail = j.error.message; } catch {}
        showError($_('settings.connected_services.usda.test_failed', { values: { detail: localizeError(detail) } }));
      }
    } catch (e) {
      usdaTestStatus = 'fail';
      showError($_('settings.connected_services.usda.test_failed', { values: { detail: e?.message ? localizeError(e.message) : $_('settings.connected_services.common.network_error') } }));
    }
  }
  function saveUsda() {
    set('usdaApiKey', usdaApiKey);
    usdaSaved = true;
    setTimeout(() => usdaSaved = false, 2000);
    if (usdaApiKey && usdaTestStatus !== 'testing') testUsdaConnection();
  }

  // ── Mealie ─────────────────────────────────────────────────────────────
  let mealieEnabled    = DB.getSetting('mealieEnabled',   false);
  let mealieBaseUrl    = DB.getSetting('mealieBaseUrl',   '');
  let mealieApiToken   = DB.getSetting('mealieApiToken',  '');
  let mealieShowToken  = false;
  let mealieTestStatus = ''; // '', 'testing', 'ok', 'fail'
  let mealieSaved      = false;
  // Banner status: show "ok" as soon as both fields are populated so users
  // see the connection card immediately. Real test result overrides on
  // testing/fail. Same shape AI Assistant uses for its banner.
  $: mealieBannerStatus = (mealieTestStatus === 'testing' || mealieTestStatus === 'fail')
    ? mealieTestStatus
    : (mealieBaseUrl && mealieApiToken ? 'ok' : '');

  async function testMealieConnection() {
    if (!mealieBaseUrl || !mealieApiToken) {
      mealieTestStatus = 'fail';
      showError($_('settings.connected_services.mealie.fields_required'));
      return;
    }
    mealieTestStatus = 'testing';
    try {
      // POST goes through the server's CSRF middleware; raw fetch needs the
      // X-CSRF-Token header (PWA cookie auth) or Authorization bearer (native
      // server mode). Issue #24: this was missing and every Test click 403'd.
      const headers = { 'Content-Type': 'application/json' };
      if (isNative && getServerUrl()) {
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } else if (!isNative) {
        const csrf = localStorage.getItem('nt:csrf');
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const res = await fetch(apiUrl('/api/mealie/proxy'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          baseUrl: mealieBaseUrl,
          token:   mealieApiToken,
          path:    '/api/recipes?perPage=1&page=1',
        }),
      });
      if (res.ok) {
        mealieTestStatus = 'ok';
        showSuccess($_('settings.connected_services.mealie.verified'));
      } else {
        mealieTestStatus = 'fail';
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) detail = j.error; } catch {}
        showError($_('settings.connected_services.mealie.test_failed', { values: { detail: localizeError(detail) } }));
      }
    } catch (e) {
      mealieTestStatus = 'fail';
      showError($_('settings.connected_services.mealie.test_failed', { values: { detail: e?.message ? localizeError(e.message) : $_('settings.connected_services.common.network_error') } }));
    }
  }
  function saveMealie() {
    set('mealieBaseUrl', mealieBaseUrl);
    set('mealieApiToken', mealieApiToken);
    mealieSaved = true;
    setTimeout(() => mealieSaved = false, 2000);
    if (mealieBaseUrl && mealieApiToken && mealieTestStatus !== 'testing') {
      testMealieConnection();
    }
  }

  // CookTrace: same shape as Mealie above, but the token is a CT PAT
  // (ct_pat_...) with the read:recipes scope. The Test button hits
  // /api/cooktrace/proxy → /api/v1/me on the user's CT instance and
  // reports the signed-in CT username on success, or a specific
  // failure reason (missing scope, bad token, unreachable URL).
  let cooktraceEnabled    = DB.getSetting('cooktraceEnabled',   false);
  let cooktraceBaseUrl    = DB.getSetting('cooktraceBaseUrl',   '');
  let cooktraceApiToken   = DB.getSetting('cooktraceApiToken',  '');
  let cooktraceShowToken  = false;
  let cooktraceTestStatus = '';
  let cooktraceSaved      = false;
  $: cooktraceBannerStatus = (cooktraceTestStatus === 'testing' || cooktraceTestStatus === 'fail')
    ? cooktraceTestStatus
    : (cooktraceBaseUrl && cooktraceApiToken ? 'ok' : '');

  async function testCooktraceConnection() {
    if (!cooktraceBaseUrl || !cooktraceApiToken) {
      cooktraceTestStatus = 'fail';
      showError($_('settings.connected_services.cooktrace.fields_required'));
      return;
    }
    cooktraceTestStatus = 'testing';
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (isNative && getServerUrl()) {
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } else if (!isNative) {
        const csrf = localStorage.getItem('nt:csrf');
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const res = await fetch(apiUrl('/api/cooktrace/proxy'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          baseUrl: cooktraceBaseUrl,
          token:   cooktraceApiToken,
          path:    '/api/v1/me',
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        const scopes = Array.isArray(body?.scopes) ? body.scopes : [];
        if (!scopes.includes('read:recipes')) {
          cooktraceTestStatus = 'fail';
          showError($_('settings.connected_services.cooktrace.missing_recipes_scope'));
          return;
        }
        cooktraceTestStatus = 'ok';
        showSuccess(body?.user?.username ? $_('settings.connected_services.cooktrace.connected_as', { values: { name: body.user.username } }) : $_('settings.connected_services.cooktrace.verified'));
      } else {
        cooktraceTestStatus = 'fail';
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) detail = j.error; } catch {}
        showError($_('settings.connected_services.cooktrace.test_failed', { values: { detail: localizeError(detail) } }));
      }
    } catch (e) {
      cooktraceTestStatus = 'fail';
      showError($_('settings.connected_services.cooktrace.test_failed', { values: { detail: e?.message ? localizeError(e.message) : $_('settings.connected_services.common.network_error') } }));
    }
  }
  function saveCooktrace() {
    set('cooktraceBaseUrl', cooktraceBaseUrl);
    set('cooktraceApiToken', cooktraceApiToken);
    cooktraceSaved = true;
    setTimeout(() => cooktraceSaved = false, 2000);
    if (cooktraceBaseUrl && cooktraceApiToken && cooktraceTestStatus !== 'testing') {
      testCooktraceConnection();
    }
  }

  // Bulk-import state. Progress lives on `ctBulkProgress` so the button
  // can render a live "3 / 42" while the batch runs. Result stays on
  // `ctBulkLastResult` after the run so the setting shows a summary
  // without needing a toast that scrolls off.
  let ctBulkBusy         = false;
  let ctBulkProgress     = { done: 0, total: 0 };
  let ctBulkLastResult   = null;
  let ctPantryBulkBusy   = false;
  let ctPantryBulkProgress = { done: 0, total: 0 };
  let ctPantryBulkLastResult = null;

  async function _ctBulkImport() {
    if (ctBulkBusy) return;
    const { CookTrace } = await import('../../lib/cooktraceApi.js');
    if (!CookTrace.isConfigured()) {
      showError($_('settings.connected_services.cooktrace.configure_first'));
      return;
    }
    // Confirm before an ambient long-running job: users with 100+ recipes
    // won't want this to kick off from a stray tap.
    const proceed = window.confirm($_('settings.connected_services.cooktrace.confirm_recipes'));
    if (!proceed) return;
    ctBulkBusy = true;
    ctBulkProgress = { done: 0, total: 0 };
    ctBulkLastResult = null;
    let imported = 0, updated = 0, skipped = 0;
    try {
      // Grab existing CT-sourced meals up front so we can tell "imported new"
      // from "updated existing" without a per-item roundtrip. Server-side
      // upsert already handles dedup on (source_app, source_external_id);
      // this is only for the summary count.
      let existingSet = new Set();
      try {
        const all = await NtApi.getMeals();
        for (const m of all) {
          if (m?.source_app === 'cooktrace' && m?.source_external_id) {
            existingSet.add(m.source_external_id);
          }
        }
      } catch { /* summary count degrades gracefully */ }

      // Page through CT's list endpoint. 50 per page keeps the response
      // small and lets us start updating progress after ~one round trip.
      const PAGE = 50;
      let offset = 0;
      const ids = [];
      while (true) {
        const meta = await CookTrace.searchWithMeta('', Math.floor(offset / PAGE) + 1, PAGE);
        const items = meta?.items || [];
        for (const it of items) if (it?.id != null) ids.push(it.id);
        if (!meta?.hasMore || items.length === 0) break;
        offset += items.length;
        // Safety cap: if the server misreports hasMore, bail after
        // 20 pages (~1000 recipes) rather than looping.
        if (offset >= 1000) break;
      }
      ctBulkProgress = { done: 0, total: ids.length };
      if (ids.length === 0) {
        ctBulkLastResult = { imported: 0, updated: 0, skipped: 0 };
        showSuccess($_('settings.connected_services.cooktrace.no_recipes'));
        return;
      }

      let firstErrorR = null;
      for (const id of ids) {
        try {
          const full = await CookTrace.getRecipe(id);
          if (!full) { skipped++; if (!firstErrorR) firstErrorR = $_('settings.connected_services.cooktrace.recipe_fetch_failed', { values: { id } }); continue; }
          const mapped = CookTrace.mapRecipe(full);
          if (!mapped) { skipped++; continue; }
          const wasExisting = existingSet.has(mapped.source_external_id);

          // Mirror MealEditor.save()'s recipe branch: stamp is_recipe,
          // pick a totalGrams from the item portions, and store nutrition
          // per-serving (yields defaults to servings when set, else 1).
          const totalGrams = Math.round((mapped.items || []).reduce((s, it) => {
            const p = Number(it.portion) || 0;
            const u = (it.unit || '').toLowerCase();
            // Only sum weight-typed units to avoid pretending 1 tsp = 1 g.
            // Countables and volume rows fall through as 0; the recipe still
            // saves, just with a smaller inferred total. Users can Recompute
            // inside NT once density data is added.
            if (u === 'g' || u === 'gram' || u === 'grams') return s + p;
            if (u === 'kg') return s + p * 1000;
            if (u === 'oz') return s + p * 28.3495;
            if (u === 'lb') return s + p * 453.592;
            return s;
          }, 0)) || 100;
          const yields = Math.max(1, Number(mapped.servings) || 1);
          const perServing = Object.fromEntries(
            Object.entries(mapped.nutrition || {}).map(([k, v]) => [k, (parseFloat(v) || 0) / yields])
          );
          const item = {
            ...mapped,
            is_recipe: 1,
            portion: totalGrams / yields,
            unit: mapped.unit || 'g',
            servings: yields,
            nutrition: perServing,
          };
          await NtApi.createMeal(item);
          if (wasExisting) updated++;
          else imported++;
        } catch (e) {
          skipped++;
          const em = e?.message || String(e);
          if (!firstErrorR) firstErrorR = em;
          console.warn('[CookTrace bulk] recipe', id, 'failed:', em);
        }
        ctBulkProgress = { ...ctBulkProgress, done: ctBulkProgress.done + 1 };
      }
      ctBulkLastResult = { imported, updated, skipped };
      const summary = $_('settings.connected_services.cooktrace.import_summary', { values: { imported, updated, collided: 0, skipped } });
      if (skipped && !(imported || updated)) {
        showError(firstErrorR ? $_('settings.connected_services.cooktrace.summary_first_error', { values: { summary, error: localizeError(firstErrorR) } }) : summary);
      } else {
        showSuccess(summary);
      }
    } catch (e) {
      showError($_('settings.connected_services.cooktrace.bulk_failed', { values: { error: e?.message ? localizeError(e.message) : $_('settings.connected_services.common.unknown_error') } }));
    } finally {
      ctBulkBusy = false;
    }
  }

  // Bulk-import CT pantry items into NT's Foods library. Skips generics
  // that have variants (their children carry the real nutrition), pulls
  // leaves and standalone rows only. Dedup on (source_app, source_external_id)
  // mirrors the recipe path: server does the upsert on foodList so re-runs
  // are safe. Requires the `read:pantry` scope on the CT token; a scope-
  // missing failure surfaces as a clear error instead of a silent no-op.
  async function _ctBulkImportPantry() {
    if (ctPantryBulkBusy) return;
    const { CookTrace } = await import('../../lib/cooktraceApi.js');
    if (!CookTrace.isConfigured()) {
      showError($_('settings.connected_services.cooktrace.configure_first'));
      return;
    }
    const proceed = window.confirm($_('settings.connected_services.cooktrace.confirm_pantry'));
    if (!proceed) return;
    ctPantryBulkBusy = true;
    ctPantryBulkProgress = { done: 0, total: 0 };
    ctPantryBulkLastResult = null;
    let imported = 0, updated = 0, skipped = 0, collided = 0;
    try {
      const list = await CookTrace.listPantry();
      if (!list.ok) {
        if (list.reason === 'not_configured') {
          showError($_('settings.connected_services.cooktrace.configure_first'));
        } else if (list.reason === 'scope') {
          showError($_('settings.connected_services.cooktrace.missing_pantry_scope'));
        } else if (list.reason === 'not_found') {
          showError($_('settings.connected_services.cooktrace.pantry_old_server'));
        } else if (list.reason === 'auth') {
          showError($_('settings.connected_services.cooktrace.token_rejected'));
        } else {
          showError($_('settings.connected_services.cooktrace.pantry_request_failed', { values: { status: list.status || $_('settings.connected_services.common.unknown_error') } }));
        }
        return;
      }
      const items = list.items;
      // Dedup targets on the NT side. foodList has the same partial unique
      // index shape as meals; we use its source columns for the count only.
      let existingSet = new Set();
      try {
        const foods = await NtApi.getFoods();
        for (const f of foods) {
          if (f?.source_app === 'cooktrace' && f?.source_external_id) {
            existingSet.add(f.source_external_id);
          }
        }
      } catch { /* count degrades gracefully */ }

      ctPantryBulkProgress = { done: 0, total: items.length };
      if (items.length === 0) {
        ctPantryBulkLastResult = { imported: 0, updated: 0, skipped: 0, collided: 0 };
        showSuccess($_('settings.connected_services.cooktrace.no_pantry_items'));
        return;
      }
      let firstError = null;
      for (const it of items) {
        try {
          const wasExisting = existingSet.has(it.source_external_id);
          const saved = await NtApi.createFood(it);
          // POST /api/foods has a barcode dedup gate that fires BEFORE the
          // insert and returns the pre-existing row untouched. When that
          // happens the CookTrace data is deliberately not applied, so
          // counting it as "imported" would report work that never
          // occurred. The returned row tells us which branch ran: our own
          // insert and the federation upsert both echo back the
          // source_external_id we sent, while the barcode gate returns
          // somebody else's row (null, or a different pantry id).
          if (saved && saved.source_external_id !== it.source_external_id) {
            collided++;
          } else if (wasExisting) {
            updated++;
          } else {
            imported++;
          }
        } catch (e) {
          skipped++;
          const msg = e?.message || String(e);
          if (!firstError) firstError = msg;
          console.warn('[CookTrace pantry bulk] item', it?.source_external_id, 'failed:', msg);
        }
        ctPantryBulkProgress = { ...ctPantryBulkProgress, done: ctPantryBulkProgress.done + 1 };
      }
      ctPantryBulkLastResult = { imported, updated, skipped, collided };
      const summary = $_('settings.connected_services.cooktrace.import_summary', { values: { imported, updated, collided, skipped } });
      // Systemic failure (every item errored the same way): surface the first
      // error verbatim so the user can see WHY, not just a "N skipped" count.
      if (skipped && !(imported || updated || collided)) {
        showError(firstError ? $_('settings.connected_services.cooktrace.summary_first_error', { values: { summary, error: localizeError(firstError) } }) : summary);
      } else {
        showSuccess(summary);
      }
    } catch (e) {
      showError($_('settings.connected_services.cooktrace.pantry_failed', { values: { error: e?.message ? localizeError(e.message) : $_('settings.connected_services.common.unknown_error') } }));
    } finally {
      ctPantryBulkBusy = false;
    }
  }

  // ── OFF Local mirror status ────────────────────────────────────────────
  let offMirrorStatus = null;
  let offMirrorPoll = null;
  let offRefreshSaving = false;
  function _fmtGB(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  function _fmtAge(mtimeMs) {
    if (!mtimeMs) return '';
    const days = (Date.now() - mtimeMs) / (24 * 60 * 60 * 1000);
    if (days < 1) {
      const h = Math.max(1, Math.round(days * 24));
      return $_('settings.connected_services.off.updated_hours_ago', { values: { count: h } });
    }
    const d = Math.round(days);
    return $_('settings.connected_services.off.updated_days_ago', { values: { count: d } });
  }
  async function _loadOffMirrorStatus() {
    try {
      offMirrorStatus = await NtApi.get('/api/off-local/status');
    } catch { /* leave previous value so the banner doesn't flicker on a transient blip */ }
  }
  let _offPollCadence = 30000;
  function _scheduleNextOffPoll() {
    if (offMirrorPoll) { clearTimeout(offMirrorPoll); offMirrorPoll = null; }
    if (!$envLocks?.off_local) return;
    offMirrorPoll = setTimeout(async () => {
      await _loadOffMirrorStatus();
      _offPollCadence = offMirrorStatus?.refresh?.state === 'downloading' ? 2000 : 30000;
      _scheduleNextOffPoll();
    }, _offPollCadence);
  }
  function _startOffMirrorPolling() {
    if (offMirrorPoll || !$envLocks?.off_local) return;
    _loadOffMirrorStatus().then(() => {
      _offPollCadence = offMirrorStatus?.refresh?.state === 'downloading' ? 2000 : 30000;
      _scheduleNextOffPoll();
    });
  }
  function _stopOffMirrorPolling() {
    if (offMirrorPoll) { clearTimeout(offMirrorPoll); offMirrorPoll = null; }
  }
  async function _triggerOffRefresh() {
    try {
      await NtApi.post('/api/off-local/refresh', {});
      await _loadOffMirrorStatus();
      _offPollCadence = 2000;
      _scheduleNextOffPoll();
    } catch (e) {
      showError(localizeError(e.message) || $_('settings.connected_services.off.refresh_failed'));
    }
  }
  async function _setOffRefreshInterval(value) {
    offRefreshSaving = true;
    try {
      await NtApi.put('/api/off-local/schedule', { interval: value });
      await _loadOffMirrorStatus();
    } catch (e) {
      showError(localizeError(e.message) || $_('settings.connected_services.off.auto_refresh_failed'));
    } finally {
      offRefreshSaving = false;
    }
  }
  // Drill-in mount replaces `openSections.connectedServices` — start polling
  // as soon as the local mirror is env-locked. Reactive so it also fires when
  // envLocks resolves after mount (fetched from /api/app-config/env-locks).
  $: if ($envLocks?.off_local) _startOffMirrorPolling();
  onDestroy(() => { _stopOffMirrorPolling(); });

  // Banner derivation — kept here so the markup stays declarative.
  $: _offRefresh = offMirrorStatus?.refresh || null;
  $: _offDownloading = _offRefresh?.state === 'downloading';
  $: _offFailed     = _offRefresh?.state === 'failed';
  $: _offIntervalMs = ({ off: null, daily: 86_400_000, weekly: 604_800_000, monthly: 2_592_000_000 })[offMirrorStatus?.refresh_interval || 'weekly'];
  $: _offStale = !_offDownloading && !_offFailed
                  && offMirrorStatus?.mtime_ms != null
                  && _offIntervalMs != null
                  && (Date.now() - offMirrorStatus.mtime_ms) > _offIntervalMs;
  $: _offReady = offMirrorStatus?.size_bytes != null;
  $: _offBannerStatus = _offDownloading ? 'testing'
                      : (_offFailed && !_offReady) ? 'fail'
                      : _offFailed ? 'warn'
                      : _offStale ? 'warn'
                      : _offReady ? 'ok'
                      : 'testing';
  $: _offBannerOkLabel = $_('settings.connected_services.off.local_mirror');
  $: _offBadgePolicy = $envLocks?.off_local_only ? $_('settings.connected_services.off.badge_air_gap') : '';
  $: _offBadgeState = (_offFailed && _offReady) ? $_('settings.connected_services.off.badge_refresh_failed')
                     : _offStale ? $_('settings.connected_services.off.badge_stale')
                     : '';
  $: _offBannerBadge = [_offBadgePolicy, _offBadgeState].filter(Boolean).join(' · ');
  $: _offBannerSubtext = _offDownloading
        ? (offMirrorStatus?.size_bytes
            ? $_('settings.connected_services.off.downloading_update', { values: { pct: Math.round((_offRefresh?.progress || 0) * 100), done: _fmtGB(_offRefresh?.bytes_done), total: _offRefresh?.bytes_total ? _fmtGB(_offRefresh.bytes_total) : '?' } })
            : $_('settings.connected_services.off.first_download', { values: { pct: Math.round((_offRefresh?.progress || 0) * 100), done: _fmtGB(_offRefresh?.bytes_done), total: _offRefresh?.bytes_total ? _fmtGB(_offRefresh.bytes_total) : '?' } }))
      : _offFailed
        ? (offMirrorStatus?.size_bytes
            ? $_('settings.connected_services.off.last_refresh_failed_serving', { values: { error: _offRefresh?.last_error ? localizeError(_offRefresh.last_error) : $_('settings.connected_services.common.unknown_error'), size: _fmtGB(offMirrorStatus.size_bytes) } })
            : $_('settings.connected_services.off.last_refresh_failed', { values: { error: _offRefresh?.last_error ? localizeError(_offRefresh.last_error) : $_('settings.connected_services.common.unknown_error') } }))
      : _offStale
        ? `${_fmtGB(offMirrorStatus?.size_bytes)} · ${_fmtAge(offMirrorStatus?.mtime_ms)}`
      : _offReady
        ? `${_fmtGB(offMirrorStatus?.size_bytes)} · ${_fmtAge(offMirrorStatus?.mtime_ms)}${$envLocks?.off_local_only ? ' · ' + $_('settings.connected_services.off.remote_disabled') : ''}`
        : $_('settings.connected_services.off.fallback_until_ready');
  $: _offRefreshBtnLabel = _offFailed ? $_('sync.retry') : $_('settings.connected_services.off.refresh_now');
  $: _offRefreshTestingLabel = (!_offReady && _offDownloading) ? $_('settings.connected_services.off.downloading') : $_('settings.connected_services.off.syncing');
</script>

<div class="section-body">

  <p class="sub-label">{$_('settings.connected_services.off.header')}</p>
  <div class="card settings-card">
    {#if $envLocks.off_local}
      <ConnectionStatus
        status={_offBannerStatus}
        okLabel={_offBannerOkLabel}
        connectedAs={_offBannerBadge}
        subtext={_offBannerSubtext}
        testingLabel={_offRefreshTestingLabel}
        error={_offFailed ? '' : ''}
        onRetest={$currentUser?.role === 'admin' ? _triggerOffRefresh : null}
        retestDisabled={_offDownloading}
        retestLabel={_offRefreshBtnLabel}
      />
      <!-- ODbL disclosure for operators running the local OFF mirror.
           Only rendered when OFF_LOCAL_DB is env-locked on the server
           (envLocks.off_local === true), and only to admin users so
           non-admin household members don't see it. Share-alike
           obligations flow to the operator serving other users, not
           to NutriTrace itself. See LICENSES.md in the repo root. -->
      {#if $currentUser?.role === 'admin'}
        <div style="padding:12px 16px;display:flex;gap:10px;align-items:flex-start;background:color-mix(in srgb,#3b82f6 6%,transparent);border-left:3px solid #3b82f6">
          <span class="material-symbols-rounded" style="font-size:18px;color:#3b82f6;flex-shrink:0;margin-top:2px">info</span>
          <div class="setting-desc" style="margin:0;line-height:1.5">
            {@html $_('settings.connected_services.off.odbl_notice', { values: {
              odbl: '<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener" class="about-link">Open Database License (ODbL)</a>',
              licenses: '<a href="https://github.com/TraceApps/nutritrace/blob/main/LICENSES.md" target="_blank" rel="noopener" class="about-link">LICENSES.md</a>',
            } })}
          </div>
        </div>
        <div class="setting-divider"></div>
      {/if}
      {#if $currentUser?.role === 'admin'}
        <div class="setting-row">
          <div>
            <span class="setting-label">{$_('settings.connected_services.off.auto_refresh')}</span>
            <div class="setting-desc">
              {$_('settings.connected_services.off.auto_refresh_desc')}
            </div>
          </div>
          <div class="select-wrap" style="width:130px">
            <select class="select sel-sm"
                    value={offMirrorStatus?.refresh_interval || 'weekly'}
                    disabled={offRefreshSaving}
                    on:change={e => _setOffRefreshInterval(e.currentTarget.value)}>
              <option value="off">{$_('settings.connected_services.off.auto_refresh_off')}</option>
              <option value="daily">{$_('settings.connected_services.off.auto_refresh_daily')}</option>
              <option value="weekly">{$_('settings.connected_services.off.auto_refresh_weekly')}</option>
              <option value="monthly">{$_('settings.connected_services.off.auto_refresh_monthly')}</option>
            </select>
          </div>
        </div>
        <div class="setting-divider"></div>
      {/if}
    {/if}
    <div class="setting-row">
      <div>
        <span class="setting-label">{$_('settings.connected_services.off.enable')}</span>
        <div class="setting-desc">
          {$_('settings.connected_services.off.enable_desc')}
        </div>
      </div>
      <Toggle checked={offEnabled} on:change={e => { offEnabled = e.detail; set('offEnabled', e.detail); }} />
    </div>
    {#if offEnabled}
      <div class="setting-divider"></div>
      <div class="setting-row">
        <span class="setting-label">{$_('settings.connected_services.off.search_language')}</span>
        <div class="select-wrap" style="width:120px">
          <select class="select sel-sm" bind:value={offPrimaryLang}>
            {#each OFF_LANGUAGE_OPTS as [v,l]}<option value={v}>{_offLangLabel(v, l)}</option>{/each}
          </select>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div style="padding:0 16px 12px">
        <span class="setting-label">{$_('settings.connected_services.off.search_language_extra')}</span>
        <div class="setting-desc" style="margin-bottom:8px">{$_('settings.connected_services.off.search_language_extra_desc')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          {#each OFF_LANGUAGE_OPTS.filter(([v]) => v !== offPrimaryLang) as [v,l]}
            <button type="button" class="chip" class:accent={offExtraLangs.includes(v)}
              aria-pressed={offExtraLangs.includes(v)} on:click={() => toggleOffExtraLang(v)}>
              {#if offExtraLangs.includes(v)}<span class="material-symbols-rounded" style="font-size:14px">check</span>{/if}
              {_offLangLabel(v, l)}
            </button>
          {/each}
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <span class="setting-label">{$_('settings.connected_services.off.search_country')}</span>
        <div class="select-wrap" style="width:150px">
          <select class="select sel-sm" bind:value={offSearchCountry}>
            {#each OFF_COUNTRY_OPTS as c}<option value={c}>{_offCountryLabel(c)}</option>{/each}
          </select>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <span class="setting-label">{$_('settings.connected_services.off.upload_country')}</span>
        <div class="select-wrap" style="width:150px">
          <select class="select sel-sm" bind:value={offUploadCountry}>
            <option value="Auto">{$_('settings.connected_services.off.upload_country_auto')}</option>
            {#each OFF_COUNTRY_OPTS.filter(c => c !== 'World') as c}<option value={c}>{_offCountryLabel(c)}</option>{/each}
          </select>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="setting-row">
        <div>
          <span class="setting-label">{$_('settings.connected_services.off.import_portion')}</span>
          <div class="setting-desc">
            {$_('settings.connected_services.off.import_portion_desc')}
          </div>
        </div>
        <div class="select-wrap" style="width:150px">
          <select class="select sel-sm" bind:value={offImportPortion}>
            <option value="per100g">{$_('settings.connected_services.off.import_portion_100g')}</option>
            <option value="perServing">{$_('settings.connected_services.off.import_portion_serving')}</option>
          </select>
        </div>
      </div>
      <div class="setting-divider"></div>
      <div class="form-group" style="padding:10px 16px 14px">
        <label class="form-label" for="off-user">{$_('settings.connected_services.off.account_username')}</label>
        <div class="setting-desc" style="margin:0 0 8px 0;line-height:1.4">
          {$_('settings.connected_services.off.account_note')}
          <a href="https://world.openfoodfacts.org/cgi/user.pl" target="_blank" rel="noopener" class="about-link">{$_('settings.connected_services.off.account_create_link')}</a>
        </div>
        <input id="off-user" class="input" style="margin-bottom:8px" placeholder={$_('settings.connected_services.off.username_placeholder')} bind:value={offUsername} />
        <label class="form-label" for="off-pass">{$_('settings.connected_services.off.account_password')}</label>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          {#if offShowPass}
            <input id="off-pass" class="input" type="text" style="flex:1" placeholder={$_('settings.connected_services.off.password_placeholder')} bind:value={offPassword} />
          {:else}
            <input id="off-pass" class="input" type="password" style="flex:1" placeholder={$_('settings.connected_services.off.password_placeholder')} bind:value={offPassword} />
          {/if}
          <button class="btn-icon" on:click={() => offShowPass = !offShowPass} title={offShowPass ? $_('common.hide') : $_('settings.connected_services.common.show')}>
            <span class="material-symbols-rounded">{offShowPass ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
        <button class="btn btn-primary" style="height:36px;font-size:13px;align-self:flex-start" on:click={saveOff}>
          {#if offSaved}<span class="material-symbols-rounded" style="font-size:16px">check</span> {$_('settings.connected_services.common.saved')}{:else}{$_('common.save')}{/if}
        </button>
      </div>
    {/if}
  </div>

  <p class="sub-label">USDA FoodData Central</p>
  <div class="card settings-card">
    {#if usdaEnabled}
      <ConnectionStatus
        status={usdaBannerStatus}
        error={usdaTestStatus === 'fail' ? $_('settings.connected_services.usda.check_key') : ''}
        onRetest={() => testUsdaConnection()}
        retestDisabled={usdaTestStatus === 'testing' || !usdaApiKey}
      />
    {/if}
    <div class="setting-row">
      <div>
        <span class="setting-label">{$_('settings_integrations.enable_usda')}</span>
        <div class="setting-desc">
          {$_('settings.connected_services.usda.desc')}
          <a href="https://fdc.nal.usda.gov/api-key-signup" target="_blank" rel="noopener" class="about-link">{$_('settings.connected_services.usda.key_link')}</a>
        </div>
      </div>
      <Toggle checked={usdaEnabled} on:change={e => { usdaEnabled = e.detail; set('usdaEnabled', e.detail); }} />
    </div>
    {#if usdaEnabled}
      <div class="setting-divider"></div>
      <div class="form-group" style="padding:10px 16px 14px">
        <label class="form-label" for="usda-key">{$_('settings.connected_services.usda.api_key')}</label>
        <input id="usda-key" class="input" type="text"
          placeholder={$_('wizard_deep.usda_key_ph')}
          bind:value={usdaApiKey}
          on:blur={saveUsda}
          autocomplete="off" style="width:100%" />
      </div>
    {/if}
  </div>

  <p class="sub-label">{$_('settings_integrations.mealie_section')}</p>
  <div class="card settings-card">
    {#if mealieEnabled}
      <ConnectionStatus
        status={mealieBannerStatus}
        error={mealieTestStatus === 'fail' ? $_('settings.connected_services.mealie.check') : ''}
        onRetest={() => testMealieConnection()}
        retestDisabled={mealieTestStatus === 'testing' || !mealieBaseUrl || !mealieApiToken}
      />
    {/if}
    <div class="setting-row">
      <div>
        <span class="setting-label">{$_('settings_integrations.enable_mealie')}</span>
        <div class="setting-desc">{$_('settings.connected_services.mealie.desc')}</div>
      </div>
      <Toggle checked={mealieEnabled} on:change={e => { mealieEnabled = e.detail; set('mealieEnabled', e.detail); }} />
    </div>
    {#if mealieEnabled}
      <div class="setting-divider"></div>
      <div class="form-group" style="padding:10px 16px">
        <label class="form-label" for="mealie-base-url">{$_('settings_integrations.base_url')}</label>
        <input id="mealie-base-url" class="input" type="url"
          placeholder="https://mealie.example.com"
          bind:value={mealieBaseUrl}
          on:blur={saveMealie}
          style="width:100%" />
      </div>
      <div class="setting-divider"></div>
      <div class="form-group" style="padding:10px 16px">
        <label class="form-label" for="mealie-api-token">{$_('settings.connected_services.common.api_token')}</label>
        <div style="display:flex;gap:8px;align-items:center">
          {#if mealieShowToken}
            <input id="mealie-api-token" class="input" type="text"
              placeholder={$_('settings_main_deep.bearer_ph')}
              bind:value={mealieApiToken}
              on:blur={saveMealie}
              autocomplete="off" style="flex:1" />
          {:else}
            <input id="mealie-api-token" class="input" type="password"
              placeholder={$_('settings_main_deep.bearer_ph')}
              bind:value={mealieApiToken}
              on:blur={saveMealie}
              autocomplete="off" style="flex:1" />
          {/if}
          <button class="btn-icon" on:click={() => mealieShowToken = !mealieShowToken}
            title={mealieShowToken ? $_('common.hide') : $_('settings.connected_services.common.show')}>
            <span class="material-symbols-rounded">{mealieShowToken ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
      </div>
    {/if}
  </div>

  <p class="sub-label">{$_('settings_integrations.cooktrace_section')}</p>
  <div class="card settings-card">
    {#if cooktraceEnabled}
      <ConnectionStatus
        status={cooktraceBannerStatus}
        error={cooktraceTestStatus === 'fail' ? $_('settings.connected_services.cooktrace.check') : ''}
        onRetest={() => testCooktraceConnection()}
        retestDisabled={cooktraceTestStatus === 'testing' || !cooktraceBaseUrl || !cooktraceApiToken}
      />
    {/if}
    <div class="setting-row">
      <div>
        <span class="setting-label">{$_('settings_integrations.enable_cooktrace')}</span>
        <div class="setting-desc">{$_('settings_integrations.cooktrace_desc')}</div>
      </div>
      <Toggle checked={cooktraceEnabled} on:change={e => { cooktraceEnabled = e.detail; set('cooktraceEnabled', e.detail); }} />
    </div>
    {#if cooktraceEnabled}
      <div class="setting-divider"></div>
      <div class="form-group" style="padding:10px 16px">
        <label class="form-label" for="cooktrace-base-url">{$_('settings_integrations.base_url')}</label>
        <input id="cooktrace-base-url" class="input" type="url"
          placeholder="https://cooktrace.example.com"
          bind:value={cooktraceBaseUrl}
          on:blur={saveCooktrace}
          style="width:100%" />
      </div>
      <div class="setting-divider"></div>
      <div class="form-group" style="padding:10px 16px">
        <label class="form-label" for="cooktrace-api-token">{$_('settings.connected_services.common.api_token')}</label>
        <div style="display:flex;gap:8px;align-items:center">
          {#if cooktraceShowToken}
            <input id="cooktrace-api-token" class="input" type="text"
              placeholder="ct_pat_..."
              bind:value={cooktraceApiToken}
              on:blur={saveCooktrace}
              autocomplete="off" style="flex:1" />
          {:else}
            <input id="cooktrace-api-token" class="input" type="password"
              placeholder="ct_pat_..."
              bind:value={cooktraceApiToken}
              on:blur={saveCooktrace}
              autocomplete="off" style="flex:1" />
          {/if}
          <button class="btn-icon" on:click={() => cooktraceShowToken = !cooktraceShowToken}
            title={cooktraceShowToken ? $_('common.hide') : $_('settings.connected_services.common.show')}>
            <span class="material-symbols-rounded">{cooktraceShowToken ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>
        <p class="setting-desc" style="margin-top:6px">
          {@html $_('settings.connected_services.cooktrace.mint_hint', { values: { scope: '<code>read:recipes</code>' } })}
        </p>
      </div>
      <!-- Bulk import: onboarding shortcut for someone with a lot of CT
           recipes. Uses the same pull path as the Foods > Recipes chip
           (same upsert semantics via source_app + source_external_id),
           just looped over every recipe from CT with progress + skip
           handling so partial failures do not abort the batch. Only
           surfaced when the connection is healthy. -->
      {#if cooktraceBaseUrl && cooktraceApiToken && cooktraceTestStatus !== 'fail'}
        <div class="setting-divider"></div>
        <div class="form-group" style="padding:10px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="min-width:0;flex:1">
              <span class="setting-label">{$_('settings.connected_services.cooktrace.import_recipes_title')}</span>
              <div class="setting-desc">{$_('settings.connected_services.cooktrace.import_recipes_desc')}</div>
            </div>
            <button class="btn btn-primary btn-sm" on:click={_ctBulkImport} disabled={ctBulkBusy} style="flex-shrink:0">
              {#if ctBulkBusy}
                <span class="material-symbols-rounded ct-spin" style="font-size:16px;vertical-align:middle">refresh</span>
                {ctBulkProgress.done}/{ctBulkProgress.total}
              {:else}
                <span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;margin-right:4px">download</span>
                {$_('settings.connected_services.cooktrace.import_all')}
              {/if}
            </button>
          </div>
          {#if !ctBulkBusy && ctBulkLastResult}
            <p class="setting-desc" style="margin-top:8px;color:var(--text-2)">
              {$_('settings.connected_services.cooktrace.last_run', { values: { imported: ctBulkLastResult.imported, updated: ctBulkLastResult.updated, skipped: ctBulkLastResult.skipped } })}
            </p>
          {/if}
        </div>
        <div class="form-group" style="padding:10px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="min-width:0;flex:1">
              <span class="setting-label">{$_('settings.connected_services.cooktrace.import_pantry_title')}</span>
              <div class="setting-desc">{@html $_('settings.connected_services.cooktrace.import_pantry_desc', { values: { scope: '<code>read:pantry</code>' } })}</div>
            </div>
            <button class="btn btn-primary btn-sm" on:click={_ctBulkImportPantry} disabled={ctPantryBulkBusy} style="flex-shrink:0">
              {#if ctPantryBulkBusy}
                <span class="material-symbols-rounded ct-spin" style="font-size:16px;vertical-align:middle">refresh</span>
                {ctPantryBulkProgress.done}/{ctPantryBulkProgress.total}
              {:else}
                <span class="material-symbols-rounded" style="font-size:16px;vertical-align:middle;margin-right:4px">kitchen</span>
                {$_('settings.connected_services.cooktrace.import_pantry')}
              {/if}
            </button>
          </div>
          {#if !ctPantryBulkBusy && ctPantryBulkLastResult}
            <p class="setting-desc" style="margin-top:8px;color:var(--text-2)">
              {$_('settings.connected_services.cooktrace.last_run', { values: { imported: ctPantryBulkLastResult.imported, updated: ctPantryBulkLastResult.updated, skipped: ctPantryBulkLastResult.skipped } })}
              {#if ctPantryBulkLastResult.collided}
                <br />{$_('settings.connected_services.cooktrace.last_run_collided', { values: { count: ctPantryBulkLastResult.collided } })}
              {/if}
            </p>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Local spin keyframes for the CT bulk-import buttons while a batch is
     running. Scoped by our .ct-spin class name (not the generic .spin
     used by other Settings sub-components) so styles do not collide. */
  @keyframes ct-spin-rot { to { transform: rotate(360deg); } }
  .ct-spin { animation: ct-spin-rot 1s linear infinite; display: inline-block; }
</style>
