/**
 * Unit tests for src/lib/diary-export.js (Diary → Export as CSV for a
 * chosen period). Pure functions, no DB or browser needed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  presetRange, buildDiaryCsv, diaryCsvFilename, exportNutrientColumns, csvEscape,
} from '../src/lib/diary-export.js';

const TODAY = new Date(2026, 9, 25, 13, 0); // 2026-10-25, local time
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

function parse(csv) {
  assert.ok(csv.startsWith('﻿'), 'starts with a UTF-8 BOM');
  return csv.slice(1).split('\r\n').filter(Boolean);
}

test('presets: today, yesterday, rolling week and month ending today', () => {
  assert.deepEqual(presetRange('today', TODAY), { start: '2026-10-25', end: '2026-10-25' });
  assert.deepEqual(presetRange('yesterday', TODAY), { start: '2026-10-24', end: '2026-10-24' });
  assert.deepEqual(presetRange('week', TODAY), { start: '2026-10-19', end: '2026-10-25' });
  assert.deepEqual(presetRange('month', TODAY), { start: '2026-09-26', end: '2026-10-25' });
  assert.deepEqual(presetRange('yesterday', new Date(2026, 2, 1)), { start: '2026-02-28', end: '2026-02-28' });
  assert.throws(() => presetRange('year', TODAY), /Unknown export preset/);
});

test('rows: date order, meal order, user meal names, amount = portion × quantity, quantity in values', () => {
  const days = [
    { date: '2026-10-24', items: [
      { name: 'Chicken', meal: 1, quantity: 1.5, portion: 100, unit: 'g', nutrition: { calories: 165, proteins: 31 } },
      { name: 'Oats', meal: 0, portion: 30, unit: 'g', nutrition: { calories: 108, proteins: 4.23 } },
    ] },
    { date: '2026-10-23', items: [{ name: 'Tea', meal: 3, portion: 250, unit: 'ml', nutrition: { calories: 2 } }] },
    { date: '2026-10-10', items: [{ name: 'Outside the range', meal: 0, nutrition: { calories: 999 } }] },
  ];
  const { csv, rows } = buildDiaryCsv(days, { start: '2026-10-19', end: '2026-10-25', mealNames: ['Завтрак', 'Обед', 'Ужин', 'Перекус'] });
  assert.equal(rows, 3);
  const lines = parse(csv);
  assert.equal(lines[0], 'Date,Meal,Food,Brand,Amount,Unit,Calories (kcal),Protein (g)');
  assert.deepEqual(lines.slice(1), [
    '2026-10-23,Перекус,Tea,,250,ml,2,',
    '2026-10-24,Завтрак,Oats,,30,g,108,4.23',
    '2026-10-24,Обед,Chicken,,150,g,247.5,46.5',
  ]);
});

test('columns: diary set only, empty-for-period columns dropped, missing value is an empty cell', () => {
  const days = [{ date: '2026-10-25', items: [
    { name: 'Coffee', meal: 0, portion: 200, unit: 'ml', nutrition: { calories: 4, caffeine: 80 } },
    { name: 'Bread', meal: 0, portion: 40, unit: 'g', nutrition: { calories: 100, fat: 0 } },
  ] }];
  const off = parse(buildDiaryCsv(days, { start: '2026-10-25', end: '2026-10-25', mealNames: MEALS }).csv);
  assert.equal(off[0], 'Date,Meal,Food,Brand,Amount,Unit,Calories (kcal),Fat (g)', 'caffeine is not a default column');
  assert.equal(off[1], '2026-10-25,Breakfast,Coffee,,200,ml,4,', 'no fat value → empty, not 0');
  assert.equal(off[2], '2026-10-25,Breakfast,Bread,,40,g,100,0', 'an explicit 0 stays 0');

  const all = parse(buildDiaryCsv(days, { start: '2026-10-25', end: '2026-10-25', mealNames: MEALS, showAll: true }).csv);
  assert.match(all[0], /Caffeine \(mg\)$/);
});

test('custom nutrients follow the built-in ones', () => {
  const cols = exportNutrientColumns({ customNutriments: [{ id: 'custom_omega_3', label: 'Omega-3', unit: 'g' }] });
  assert.deepEqual(cols.at(-1), { id: 'custom_omega_3', header: 'Omega-3 (g)' });
  const days = [{ date: '2026-10-25', items: [{ name: 'Fish', meal: 2, quantity: 2, portion: 100, unit: 'g', nutrition: { calories: 200, custom_omega_3: 1.1 } }] }];
  const lines = parse(buildDiaryCsv(days, {
    start: '2026-10-25', end: '2026-10-25', mealNames: MEALS,
    customNutriments: [{ id: 'custom_omega_3', label: 'Omega-3', unit: 'g' }],
  }).csv);
  assert.equal(lines[0], 'Date,Meal,Food,Brand,Amount,Unit,Calories (kcal),Omega-3 (g)');
  assert.equal(lines[1], '2026-10-25,Dinner,Fish,,200,g,400,2.2');
});

test('escaping: quotes, commas and line breaks stay inside one field', () => {
  assert.equal(csvEscape('Cheese "Gouda", sliced'), '"Cheese ""Gouda"", sliced"');
  assert.equal(csvEscape('two\nlines'), '"two\nlines"');
  const days = [{ date: '2026-10-25', items: [{ name: 'Cheese "Gouda", sliced', brand: 'Aro', meal: 0, portion: 23, unit: 'g', nutrition: { calories: 56 } }] }];
  const lines = parse(buildDiaryCsv(days, { start: '2026-10-25', end: '2026-10-25', mealNames: MEALS }).csv);
  assert.equal(lines[1], '2026-10-25,Breakfast,"Cheese ""Gouda"", sliced",Aro,23,g,56');
});

test('quick calories have no amount, unnamed meal slots fall back to a number, split recipes are summed', () => {
  const days = [{ date: '2026-10-25', items: [
    { type: 'quick_calories', name: 'Quick Calories', meal: 5, nutrition: { calories: 300 } },
    { name: 'Soup', meal: 1, portion: 300, unit: 'g', nutrition: { calories: 1 },
      _splitItems: [{ name: 'Broth', nutrition: { calories: 40 } }, { name: 'Noodles', nutrition: { calories: 110 } }] },
  ] }];
  const lines = parse(buildDiaryCsv(days, { start: '2026-10-25', end: '2026-10-25', mealNames: MEALS }).csv);
  assert.equal(lines[1], '2026-10-25,Lunch,Soup,,300,g,150');
  assert.equal(lines[2], '2026-10-25,Meal 6,Quick Calories,,,,300');
});

test('an empty period produces no rows', () => {
  const { rows } = buildDiaryCsv([{ date: '2026-10-01', items: [{ name: 'x', nutrition: { calories: 1 } }] }],
    { start: '2026-10-24', end: '2026-10-24', mealNames: MEALS });
  assert.equal(rows, 0);
});

test('file name carries the period', () => {
  assert.equal(diaryCsvFilename('2026-10-19', '2026-10-25'), 'nutritrace-diary-2026-10-19_2026-10-25.csv');
  assert.equal(diaryCsvFilename('2026-10-25', '2026-10-25'), 'nutritrace-diary-2026-10-25.csv');
});
