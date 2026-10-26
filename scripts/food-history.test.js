/**
 * Picker history (src/lib/food-history.js).
 *
 * The Recently Eaten, Most Eaten and Saved tabs are derived from the diary
 * of the last 90 days. These tests pin the window, the product key, the
 * one-row-per-block rule, the order of each list and the quantity a product
 * opens with, plus a time limit for a full window.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  historyStart, productKey, buildFoodHistory, savedFoodRows, visibleRows, catalogFoodFor,
  HISTORY_FIRST, HISTORY_MORE,
} from '../src/lib/food-history.js';

const TODAY = '2026-10-26';

// A diary item as the picker stores it. `food_server_id` is the catalog id.
const item = (name, extra = {}) => ({
  name, portion: 100, unit: 'g', quantity: 1, nutrition: { calories: 100 },
  addedAt: '2026-10-26T08:00:00.000Z', meal: 0, ...extra,
});

test('history window is 90 days ending today, today included', () => {
  assert.equal(historyStart(TODAY), '2026-07-29');
  assert.equal(historyStart('2026-03-01'), '2025-12-02');
});

test('product key: catalog id, then barcode, then source, then name', () => {
  assert.equal(productKey({ food_server_id: 7, barcode: '123', name: 'X' }), 'cat:7');
  assert.equal(productKey({ food_server_id: null, barcode: '00123', name: 'X' }), 'bc:123');
  assert.equal(productKey({ food_server_id: null, source: 'usda', source_external_id: 'u9', name: 'X' }), 'ext:usda:u9');
  assert.equal(productKey({ food_server_id: null, name: 'Ёлка  ' }), productKey({ name: 'елка' }));
  assert.equal(productKey({ name: '   ' }), null);
});

test('entries outside the window and after today are dropped', () => {
  const days = [
    { date: '2026-07-28', items: [item('Old', { food_server_id: 1 })] },
    { date: '2026-07-29', items: [item('Edge', { food_server_id: 2 })] },
    { date: '2026-10-27', items: [item('Future', { food_server_id: 3 })] },
  ];
  const h = buildFoodHistory(days, { meal: 0, today: TODAY });
  assert.deepEqual(h.all.recent.map(r => r.name), ['Edge']);
});

test('recipes and quick calories are not history rows', () => {
  const days = [{ date: TODAY, items: [
    item('Soup', { food_server_id: 4, is_recipe: true }),
    item('Quick', { type: 'quick_calories', food_server_id: null }),
    item('Rice', { food_server_id: 5 }),
  ] }];
  const h = buildFoodHistory(days, { meal: 0, today: TODAY });
  assert.deepEqual(h.all.recent.map(r => r.name), ['Rice']);
});

test('one row per product within a block, counted across its entries', () => {
  const days = [
    { date: '2026-10-20', items: [item('Eggs', { food_server_id: 1 })] },
    { date: '2026-10-21', items: [item('Eggs', { food_server_id: 1 }), item('Eggs', { food_server_id: 1 })] },
  ];
  const h = buildFoodHistory(days, { meal: 0, today: TODAY });
  assert.equal(h.meal.most.length, 1);
  assert.equal(h.meal.most[0].count, 3);
  assert.equal(h.meal.most[0].lastDate, '2026-10-21');
});

test('a product can sit in the meal block and the all-meals block at once', () => {
  const days = [
    { date: TODAY, items: [item('Egg', { food_server_id: 1, meal: 0 })] },
    { date: TODAY, items: [item('Egg', { food_server_id: 1, meal: 1 })] },
  ];
  const h = buildFoodHistory(days, { meal: 0, today: TODAY });
  assert.equal(h.meal.recent.length, 1);
  assert.equal(h.meal.recent[0].count, 1);
  assert.equal(h.all.recent.length, 1);
  assert.equal(h.all.recent[0].count, 2);
});

test('recent is ordered by last log date, most by count then date', () => {
  const days = [
    { date: '2026-10-01', items: [item('Oats', { food_server_id: 1 }), item('Oats', { food_server_id: 1 }), item('Oats', { food_server_id: 1 })] },
    { date: '2026-10-25', items: [item('Yogurt', { food_server_id: 2 })] },
    { date: '2026-10-10', items: [item('Banana', { food_server_id: 3 })] },
  ];
  const h = buildFoodHistory(days, { meal: 0, today: TODAY });
  assert.deepEqual(h.all.recent.map(r => r.name), ['Yogurt', 'Banana', 'Oats']);
  assert.deepEqual(h.all.most.map(r => r.name), ['Oats', 'Yogurt', 'Banana']);
});

test('a product opens with the portion and servings of its latest entry in the scope', () => {
  const days = [
    { date: '2026-10-20', items: [item('Rice', { food_server_id: 5, meal: 2, portion: 100, quantity: 2 })] },
    { date: '2026-10-22', items: [item('Rice', { food_server_id: 5, meal: 1, portion: 150, quantity: 1 })] },
    { date: '2026-10-24', items: [item('Rice', { food_server_id: 5, meal: 2, portion: 120, quantity: 1.5 })] },
  ];
  const h = buildFoodHistory(days, { meal: 2, today: TODAY });
  assert.deepEqual(
    { portion: h.meal.recent[0].portion, servings: h.meal.recent[0].servings },
    { portion: 120, servings: 1.5 },
  );
  assert.deepEqual(
    { portion: h.all.recent[0].portion, servings: h.all.recent[0].servings },
    { portion: 120, servings: 1.5 },
  );
});

test('a catalog product resolves to the picker food object it matches', () => {
  const picker = { id: 9, name: 'Tuna', portion: 100, unit: 'g', favorite: 0 };
  const days = [{ date: TODAY, items: [item('Tuna', { food_server_id: 9 })] }];
  const h = buildFoodHistory(days, { meal: 0, today: TODAY, catalogById: new Map([[9, picker]]) });
  assert.equal(h.all.recent[0].food, picker);
  assert.equal(h.meal.most[0].food, picker, 'the same object in both blocks');
});

test('saved rows are favorite foods, latest use first, then by name', () => {
  const foods = [
    { id: 1, name: 'Bread', favorite: 1, last_used_at: '2026-10-01' },
    { id: 2, name: 'Apple', favorite: 1, last_used_at: '2026-10-20' },
    { id: 3, name: 'Carrot', favorite: 0, last_used_at: '2026-10-25' },
    { id: 4, name: 'Cake', favorite: 1, last_used_at: null },
  ];
  assert.deepEqual(savedFoodRows(foods).map(r => r.name), ['Apple', 'Bread', 'Cake']);
  assert.equal(savedFoodRows(foods)[0].key, 'cat:2');
});

test('pages show five rows first, then twenty more per click', () => {
  const list = Array.from({ length: 60 }, (_, i) => ({ name: 'p' + i }));
  assert.equal(visibleRows(list, HISTORY_FIRST).length, 5);
  assert.equal(visibleRows(list, HISTORY_FIRST + HISTORY_MORE).length, 25);
  assert.equal(visibleRows(list, 200).length, 60);
});

test('a full window of 90 days with 30 items a day is built within the time limit', () => {
  const days = [];
  for (let d = 0; d < 90; d++) {
    const date = new Date(Date.UTC(2026, 6, 29 + d)).toISOString().slice(0, 10);
    const items = Array.from({ length: 30 }, (_, i) => item('Food ' + ((d * 7 + i) % 200), { food_server_id: ((d * 7 + i) % 200) + 1, meal: i % 4 }));
    days.push({ date, items });
  }
  const started = performance.now();
  const h = buildFoodHistory(days, { meal: 1, today: TODAY });
  const elapsed = performance.now() - started;
  assert.ok(h.all.recent.length > 0 && h.meal.most.length > 0);
  assert.ok(elapsed < 250, `history took ${elapsed.toFixed(1)} ms`);
});

test('a diary item finds the catalog food it was logged from', () => {
  // Web: catalog rows carry the server's id as id.
  const web = [{ id: 7, name: 'Tuna' }, { id: 9, name: 'Oats' }];
  assert.equal(catalogFoodFor({ name: 'Oats', id: 9, food_server_id: 9 }, web), web[1]);
  // Android: rows have a local id and the server's id as server_id.
  const phone = [{ id: 1, server_id: 9, name: 'Oats' }, { id: 2, server_id: null, name: 'Bread' }];
  assert.equal(catalogFoodFor({ name: 'Oats', id: 1, food_server_id: 9 }, phone, { native: true }), phone[0]);
  // Logged on the phone before the food reached the server.
  assert.equal(catalogFoodFor({ name: 'Bread', id: 2, food_server_id: null }, phone, { native: true }), phone[1]);
  // Recipes, quick calories and deleted foods have none.
  assert.equal(catalogFoodFor({ name: 'Soup', id: 9, food_server_id: 9, is_recipe: true }, web), null);
  assert.equal(catalogFoodFor({ name: 'Quick', type: 'quick_calories' }, web), null);
  assert.equal(catalogFoodFor({ name: 'Gone', id: 42, food_server_id: 42 }, web), null);
});
