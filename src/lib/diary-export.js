/**
 * Diary → CSV export for a chosen period (Diary → Export sheet).
 *
 * Pure helpers with no browser imports so node --test can load them (text
 * comes through i18n-t.js, which falls back to English there); the sheet
 * component does the fetching and the file download.
 *
 * One row per logged item. Amount is portion × quantity, the same figure
 * the diary shows; nutrient values come from Nutrition.calculate, so they
 * already include quantity and split recipes. Nutrient columns follow the
 * diary's own rule (default set, or every built-in nutrient with "show all
 * nutrients" on) plus custom nutrients, minus columns empty for the whole
 * period. A missing value is an empty cell, never 0.
 */
import { Nutrition, NUTRIMENTS } from './nutrition.js';
import { t } from './i18n-t.js';

export const EXPORT_PRESETS = ['today', 'yesterday', 'week', 'month'];

// Week and Month are rolling windows ending today (owner's choice), not
// calendar weeks/months.
const PRESET_SPAN_DAYS = { today: 1, yesterday: 1, week: 7, month: 30 };

/** Local YYYY-MM-DD for a Date (not toISOString, which is UTC). */
export function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDays(d, days) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

/** {start, end} (inclusive, YYYY-MM-DD) for a preset, relative to `today`. */
export function presetRange(preset, today = new Date()) {
  const span = PRESET_SPAN_DAYS[preset];
  if (!span) throw new Error(`Unknown export preset '${preset}'`);
  const end = preset === 'yesterday' ? shiftDays(today, -1) : shiftDays(today, 0);
  return { start: localDate(shiftDays(end, -(span - 1))), end: localDate(end) };
}

/** Built-in nutrient columns the diary shows, then custom nutrients. */
export function exportNutrientColumns({ showAll = false, customNutriments = [] } = {}) {
  return [
    ...NUTRIMENTS.filter(n => showAll || n.default).map(n => ({ id: n.id, header: `${n.label} (${n.unit})` })),
    ...(customNutriments || []).map(n => ({ id: n.id, header: n.unit ? `${n.label} (${n.unit})` : n.label })),
  ];
}

export function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtNumber(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

// Same figure as the diary's amount line; quick-calorie entries have no
// portion at all, so they get empty Amount/Unit instead of a made-up 100 g.
function itemAmount(item) {
  if (item.type === 'quick_calories') return { amount: '', unit: '' };
  const portion = item.portion || item.amount || 100;
  const amount = Math.round(portion * (item.quantity || 1) * 10) / 10;
  return { amount: String(amount), unit: item.unit || 'g' };
}

/**
 * Build the CSV for diary days within [start, end].
 * @param {Array<{date: string, items?: object[]}>} days  as NtApi.getDiaryRange() returns;
 *   days outside [start, end] are dropped (an older server ignores the period)
 * @returns {{csv: string, rows: number}}  rows = logged items written
 */
// Column titles in the app language (English when svelte-i18n isn't set up).
function csvHeaders() {
  return [['date', 'Date'], ['meal', 'Meal'], ['food', 'Food'], ['brand', 'Brand'], ['amount', 'Amount'], ['unit', 'Unit']]
    .map(([k, en]) => t(`diary_export.csv.${k}`, null, en));
}

export function buildDiaryCsv(days, { start, end, mealNames = [], showAll = false, customNutriments = [] } = {}) {
  const inRange = (days || [])
    .filter(d => d && d.date >= start && d.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const records = [];
  for (const day of inRange) {
    const items = (day.items || [])
      .map((item, i) => ({ item, i, meal: Number(item.meal) || 0 }))
      .sort((a, b) => a.meal - b.meal || a.i - b.i);
    for (const { item, meal } of items) {
      records.push({
        date: day.date,
        meal: mealNames[meal] || t('diary_export.csv.meal_n', { n: meal + 1 }, 'Meal {n}'),
        item,
        ...itemAmount(item),
        nutrition: Nutrition.calculate(item),
      });
    }
  }

  const columns = exportNutrientColumns({ showAll, customNutriments })
    .filter(c => records.some(r => fmtNumber(r.nutrition[c.id]) !== ''));

  const lines = [
    [...csvHeaders(), ...columns.map(c => c.header)].map(csvEscape).join(','),
    ...records.map(r => [
      r.date, r.meal, r.item.name || '', r.item.brand || '', r.amount, r.unit,
      ...columns.map(c => fmtNumber(r.nutrition[c.id])),
    ].map(csvEscape).join(',')),
  ];
  // BOM so Excel reads the file as UTF-8 (Cyrillic food names), CRLF per RFC 4180.
  return { csv: '﻿' + lines.join('\r\n') + '\r\n', rows: records.length };
}

export function diaryCsvFilename(start, end) {
  return start === end ? `nutritrace-diary-${start}.csv` : `nutritrace-diary-${start}_${end}.csv`;
}
