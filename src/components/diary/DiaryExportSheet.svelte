<script>
  /**
   * DiaryExportSheet — Diary → Export. Pick a period (Today, Yesterday,
   * last 7 days, last 30 days, or From/To) and download the logged foods
   * as a CSV table. CSV is the only format for now, so there is no format
   * picker; the button label, hint and .csv file name say what it is.
   *
   * Reads only the chosen period through NtApi.getDiaryRange (server, the
   * phone's local database, or the offline mirror, depending on the mode);
   * the CSV itself comes from src/lib/diary-export.js.
   */
  import Sheet from '../ui/Sheet.svelte';
  import DateInput from '../ui/DateInput.svelte';
  import { _, locale } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { NtApi } from '../../lib/api.js';
  import { isNative } from '../../lib/platform.js';
  import { mealNames, customNutriments, diaryShowAllNutrients } from '../../stores/settings.js';
  import { showSuccess, showError, showInfo } from '../../stores/toast.js';
  import {
    EXPORT_PRESETS, presetRange, localDate, buildDiaryCsv, diaryCsvFilename,
  } from '../../lib/diary-export.js';

  export let open = false;

  const PRESET_KEYS = {
    today: 'diary_export.preset_today',
    yesterday: 'diary_export.preset_yesterday',
    week: 'diary_export.preset_week',
    month: 'diary_export.preset_month',
  };

  let preset = 'today';
  let customStart = '';
  let customEnd = '';
  let exporting = false;
  let today = localDate(new Date());

  // Each open starts from Today, with the date fields prefilled to the
  // last 7 days in case the user switches to Select Period.
  $: if (open) _reset();
  function _reset() {
    preset = 'today';
    today = localDate(new Date());
    const week = presetRange('week');
    customStart = week.start;
    customEnd = week.end;
    exporting = false;
  }

  $: range = preset === 'custom' ? { start: customStart, end: customEnd } : presetRange(preset);
  $: valid = !!(range.start && range.end && range.start <= range.end);
  // $locale in the dependencies so the label follows the app language.
  $: rangeLabel = valid ? _formatRange(range.start, range.end, $locale) : '';

  function _fmt(dateStr, withYear, lang) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(lang || undefined, withYear
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' });
  }
  function _formatRange(start, end, lang) {
    const thisYear = today.slice(0, 4);
    const withYear = start.slice(0, 4) !== thisYear || end.slice(0, 4) !== thisYear;
    if (start === end) return _fmt(start, withYear, lang);
    return `${_fmt(start, withYear, lang)} – ${_fmt(end, withYear, lang)}`;
  }

  // Same download paths as Settings → Import & Export: a blob link on the
  // web, Capacitor Filesystem into Downloads on Android.
  async function _nativeDownload(blob, filename) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const reader = new FileReader();
    const base64 = await new Promise((res, rej) => {
      reader.onload = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    await Filesystem.writeFile({ path: `Download/${filename}`, data: base64, directory: Directory.ExternalStorage, recursive: true });
  }
  function _webDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCsv() {
    if (!valid || exporting) return;
    exporting = true;
    try {
      const days = await NtApi.getDiaryRange(range.start, range.end);
      const { csv, rows } = buildDiaryCsv(days, {
        start: range.start,
        end: range.end,
        mealNames: get(mealNames) || [],
        showAll: get(diaryShowAllNutrients),
        customNutriments: get(customNutriments) || [],
      });
      if (!rows) {
        showInfo($_('diary_export.toast.empty'));
        return;
      }
      const filename = diaryCsvFilename(range.start, range.end);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      if (isNative) {
        await _nativeDownload(blob, filename);
        showSuccess($_('diary_export.toast.saved_downloads', { values: { file: filename } }));
      } else {
        _webDownload(blob, filename);
        showSuccess($_('diary_export.toast.exported', { values: { n: rows } }));
      }
      open = false;
    } catch (e) {
      showError($_('diary_export.toast.failed', { values: { error: e.message } }));
    } finally {
      exporting = false;
    }
  }
</script>

<Sheet bind:open title={$_('diary_export.title')}>
  <div class="dx-body">
    <p class="dx-label">{$_('diary_export.period')}</p>
    <div class="dx-chips" role="radiogroup" aria-label={$_('diary_export.period')}>
      {#each EXPORT_PRESETS as p}
        <button type="button" class="dx-chip" class:active={preset === p}
          role="radio" aria-checked={preset === p}
          on:click={() => (preset = p)}>{$_(PRESET_KEYS[p])}</button>
      {/each}
      <button type="button" class="dx-chip" class:active={preset === 'custom'}
        role="radio" aria-checked={preset === 'custom'}
        on:click={() => (preset = 'custom')}>
        <span class="material-symbols-rounded dx-chip-icon">date_range</span>{$_('diary_export.preset_custom')}
      </button>
    </div>

    {#if preset === 'custom'}
      <div class="dx-dates">
        <label class="dx-date">
          <span class="form-label">{$_('diary_export.from')}</span>
          <DateInput bind:value={customStart} max={customEnd || today} />
        </label>
        <label class="dx-date">
          <span class="form-label">{$_('diary_export.to')}</span>
          <DateInput bind:value={customEnd} min={customStart} max={today} />
        </label>
      </div>
    {/if}

    <p class="dx-range" class:invalid={!valid}>
      <span class="material-symbols-rounded">calendar_month</span>
      {valid ? rangeLabel : $_('diary_export.invalid_range')}
    </p>

    <button type="button" class="btn btn-primary dx-export" disabled={!valid || exporting} on:click={exportCsv}>
      <span class="material-symbols-rounded">download</span>
      {exporting ? $_('diary_export.exporting') : $_('diary_export.export_csv')}
    </button>
    <p class="dx-hint">{$_('diary_export.csv_hint')}</p>
  </div>
</Sheet>

<style>
  .dx-body { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 8px; }
  .dx-label { margin: 0; font-size: 13px; font-weight: 600; color: var(--text-2); }
  .dx-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .dx-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 7px 14px;
    border-radius: var(--radius-full);
    border: 1.5px solid var(--border);
    background: none;
    font-size: 14px;
    cursor: pointer;
    color: var(--text-2);
  }
  /* No bolder weight when active: a wider chip would re-wrap the row. */
  .dx-chip.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
  .dx-chip-icon { font-size: 18px; }
  .dx-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dx-date { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .dx-range {
    display: flex; align-items: center; gap: 6px;
    margin: 0; font-size: 14px; color: var(--text-1);
  }
  .dx-range .material-symbols-rounded { font-size: 18px; color: var(--text-3); }
  .dx-range.invalid { color: var(--danger); }
  .dx-export { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; }
  .dx-export .material-symbols-rounded { font-size: 20px; }
  .dx-hint { margin: -4px 0 0; font-size: 12px; color: var(--text-3); text-align: center; }
  @media (max-width: 360px) { .dx-dates { grid-template-columns: 1fr; } }
</style>
