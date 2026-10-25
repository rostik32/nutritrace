/**
 * Foods tab search pipeline (src/lib/food-search.js).
 *
 * One search box, one list: own and shared foods plus Open Food Facts as
 * the server answers it come first; online databases only when that finds
 * nothing or when the user asks. These tests drive the pipeline with fake
 * sources so the order of rows, paging and dedupe are pinned without a
 * network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRank, rankFoods, rowKey, createFoodSearch, foodItemActions, isDatabaseFood, foodWithBarcode, findBarcode } from '../src/lib/food-search.js';

const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

// A paged source over a fixed array, `size` items per page.
function paged(id, tier, items, { size = 2, delay = 0, calls } = {}) {
  return {
    id, tier,
    async fetchPage(query, page) {
      calls?.push(`${id}:${query}:${page}`);
      if (delay) await tick(delay);
      const start = (page - 1) * size;
      return { items: items.slice(start, start + size), hasMore: start + size < items.length };
    },
  };
}
const memory = (id, items) => ({ id, tier: 1, match: (q) => rankFoods(items, q) });

function harness() {
  const states = [];
  const fs = createFoodSearch({ debounceMs: 0, onChange: s => states.push(s) });
  return { fs, last: () => states[states.length - 1] };
}
const names = (s) => s.rows.map(r => `${r.source}:${r.item.name}`);

// ── Matching and sort ────────────────────────────────────────────────────

test('relevance: name starting with the query comes before a later word', () => {
  const foods = [{ name: 'Oat milk' }, { name: 'Milk chocolate' }, { name: 'Milk 2.5%', usage_count: 3 }];
  assert.deepEqual(rankFoods(foods, 'milk').map(f => f.name), ['Milk 2.5%', 'Milk chocolate', 'Oat milk']);
});

test('relevance: favorites first, non-matches left out', () => {
  const foods = [{ name: 'Milk' }, { name: 'Oat milk', favorite: true }, { name: 'Bread' }];
  assert.deepEqual(rankFoods(foods, 'milk').map(f => f.name), ['Oat milk', 'Milk']);
});

test('matching folds accents and forgives one typo in long words', () => {
  assert.equal(matchRank({ name: 'Café latte' }, 'cafe'), 0);
  assert.equal(matchRank({ name: 'Cottage cheese' }, 'chese'), 3);
  assert.equal(matchRank({ name: 'Bread', brand: 'Penam' }, 'penam'), 2);
  assert.equal(matchRank({ name: 'Bread' }, 'milk'), null);
});

test('alpha, recent and most orders', () => {
  const foods = [
    { name: 'Milk B', usage_count: 1, last_used_at: '2026-10-20' },
    { name: 'Milk A', usage_count: 5 },
    { name: 'Milk C', usage_count: 2, last_used_at: '2026-10-24' },
  ];
  assert.deepEqual(rankFoods(foods, 'milk', 'alpha').map(f => f.name), ['Milk A', 'Milk B', 'Milk C']);
  assert.deepEqual(rankFoods(foods, 'milk', 'recent').map(f => f.name), ['Milk C', 'Milk B', 'Milk A']);
  assert.deepEqual(rankFoods(foods, 'milk', 'most').map(f => f.name), ['Milk A', 'Milk C', 'Milk B']);
});

test('row key: barcode without leading zeros, else source and id', () => {
  assert.equal(rowKey('off', { barcode: '0036000291452' }), rowKey('usda', { barcode: '36000291452' }));
  assert.equal(rowKey('own', { id: 7, name: 'x' }), 'own:7');
});

test('row keys are unique, also for two own foods with one barcode', () => {
  const { fs, last } = harness();
  fs.start('milk', [memory('own', [
    { id: 1, name: 'Milk', barcode: '123' },
    { id: 2, name: 'Milk (2nd pack)', barcode: '0123' },
    { id: 3, name: 'Milk (3rd pack)', barcode: '123' },
  ])]);
  const keys = last().rows.map(r => r.key);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3);
});

// ── Barcode scan ─────────────────────────────────────────────────────────

test('barcode: own food found leading zeros aside', () => {
  const foods = [{ id: 1, name: 'A', barcode: '0036000291452' }, { id: 2, name: 'B' }];
  assert.equal(foodWithBarcode(foods, '36000291452')?.id, 1);
  assert.equal(foodWithBarcode(foods, '999'), null);
  assert.equal(foodWithBarcode(foods, ''), null);
});

test('barcode: steps are asked in order and the first hit wins', async () => {
  const calls = [];
  const step = (id, hit) => ({ id, find: async (c) => { calls.push(id); return hit ? { name: id + ':' + c } : null; } });
  const found = await findBarcode('42', [step('shared', false), step('off', true), step('usda', true)]);
  assert.deepEqual(found, { source: 'off', item: { name: 'off:42' } });
  assert.deepEqual(calls, ['shared', 'off']);
});

test('barcode: a failing step is a miss, nothing found is null', async () => {
  const boom = { id: 'off', find: () => { throw new Error('offline'); } };
  const usda = { id: 'usda', find: async () => ({ name: 'Milk' }) };
  assert.deepEqual(await findBarcode('1', [boom, usda]), { source: 'usda', item: { name: 'Milk' } });
  assert.equal(await findBarcode('1', [boom]), null);
  assert.equal(await findBarcode('1', []), null);
});

// ── Tiers ────────────────────────────────────────────────────────────────

test('empty query lists nothing and queries nothing', async () => {
  const calls = [];
  const { fs, last } = harness();
  fs.start('', [memory('own', [{ name: 'Milk' }]), paged('off', 1, [{ name: 'X' }], { calls })]);
  await tick();
  assert.deepEqual(last().rows, []);
  assert.deepEqual(calls, []);
});

test('tier 1 with results: online databases are not queried', async () => {
  const calls = [];
  const { fs, last } = harness();
  fs.start('milk', [
    memory('own', [{ id: 1, name: 'Milk 2.5%' }]),
    paged('off', 1, [{ name: 'Moo milk', barcode: '1' }], { calls }),
    paged('usda', 2, [{ name: 'Milk, whole' }], { calls }),
  ]);
  await tick();
  assert.deepEqual(names(last()), ['own:Milk 2.5%', 'off:Moo milk']);
  assert.deepEqual(calls, ['off:milk:1']);
  assert.equal(last().onlineAvailable, true);
  assert.equal(last().onlineDone, false);
  assert.equal(last().settled, true);
});

test('tier 1 empty: online databases are queried on their own', async () => {
  const calls = [];
  const { fs, last } = harness();
  fs.start('quinoa', [
    memory('own', []),
    paged('off', 1, [], { calls }),
    paged('usda', 2, [{ name: 'Quinoa, cooked' }], { calls }),
  ]);
  await tick();
  assert.deepEqual(calls, ['off:quinoa:1', 'usda:quinoa:1']);
  assert.deepEqual(names(last()), ['usda:Quinoa, cooked']);
  assert.equal(last().onlineDone, true);
});

test('own matches only (offline): listed at once, nothing fetched', async () => {
  const { fs, last } = harness();
  fs.start('milk', [memory('own', [{ id: 1, name: 'Milk' }])]);
  assert.deepEqual(names(last()), ['own:Milk']);
  assert.equal(last().loading, false);
  assert.equal(last().onlineAvailable, false);
});

test('search online: appended after tier 1, without products already listed', async () => {
  const { fs, last } = harness();
  fs.start('milk', [
    paged('off', 1, [{ name: 'Moo milk', barcode: '111' }]),
    paged('off-live', 2, [{ name: 'Moo milk (live)', barcode: '0111' }, { name: 'Fresh milk', barcode: '222' }]),
    paged('usda', 2, [{ name: 'Milk, whole' }]),
  ]);
  await tick();
  await fs.searchOnline();
  assert.deepEqual(names(last()), ['off:Moo milk', 'off-live:Fresh milk', 'usda:Milk, whole']);
  assert.equal(last().onlineDone, true);
});

test('an own food hides the database row with its barcode; shared copy too', async () => {
  const { fs, last } = harness();
  fs.start('nutella', [
    memory('own', [{ id: 1, name: 'Nutella (mine)', barcode: '3017620422003' }]),
    { id: 'shared', tier: 1, match: () => [{ id: 9, name: 'Nutella (shared)', barcode: '3017620422003' }] },
    paged('off', 1, [{ name: 'Nutella', barcode: '3017620422003' }, { name: 'Nutella B-ready', barcode: '8000500217078' }]),
  ]);
  await tick();
  assert.deepEqual(names(last()), ['own:Nutella (mine)', 'off:Nutella B-ready']);
});

// ── Paging ───────────────────────────────────────────────────────────────

test('load more: next page of the first source with pages left, one at a time, stops at the end', async () => {
  const calls = [];
  const items = [1, 2, 3, 4, 5].map(n => ({ name: `Milk ${n}`, barcode: String(n) }));
  const { fs, last } = harness();
  fs.start('milk', [paged('off', 1, items, { calls, delay: 5 })]);
  await tick(20);
  assert.equal(last().rows.length, 2);
  assert.equal(last().hasMore, true);
  const a = fs.loadMore();
  const b = fs.loadMore();   // ignored: a page is already in flight
  await Promise.all([a, b]);
  assert.deepEqual(calls, ['off:milk:1', 'off:milk:2']);
  await fs.loadMore();
  assert.equal(last().rows.length, 5);
  assert.equal(last().hasMore, false);
  await fs.loadMore();
  assert.deepEqual(calls, ['off:milk:1', 'off:milk:2', 'off:milk:3']);
});

test('load more continues with the next source once the first is exhausted', async () => {
  const calls = [];
  const { fs, last } = harness();
  fs.start('x', [
    paged('off', 1, [{ name: 'x1', barcode: '1' }], { calls }),
    paged('off-live', 2, [{ name: 'x2', barcode: '2' }, { name: 'x3', barcode: '3' }, { name: 'x4', barcode: '4' }], { calls }),
  ]);
  await tick();
  await fs.searchOnline();
  await fs.loadMore();
  assert.deepEqual(calls, ['off:x:1', 'off-live:x:1', 'off-live:x:2']);
  assert.deepEqual(last().rows.map(r => r.item.name), ['x1', 'x2', 'x3', 'x4']);
});

// ── Stale responses ──────────────────────────────────────────────────────

test('results for an earlier query are discarded', async () => {
  const { fs, last } = harness();
  const slow = { id: 'off', tier: 1, async fetchPage(q) {
    await tick(q === 'mil' ? 30 : 1);
    return { items: [{ name: 'result for ' + q, barcode: q }], hasMore: false };
  } };
  fs.start('mil', [slow]);
  await tick(2);
  fs.start('milk', [slow]);
  await tick(50);
  assert.deepEqual(last().rows.map(r => r.item.name), ['result for milk']);
});

test('refresh memory: a newly saved own food replaces the database row', async () => {
  const own = [];
  const { fs, last } = harness();
  fs.start('nutella', [
    { id: 'own', tier: 1, match: (q) => rankFoods(own, q) },
    paged('off', 1, [{ name: 'Nutella', barcode: '3017620422003' }]),
  ]);
  await tick();
  assert.deepEqual(names(last()), ['off:Nutella']);
  own.push({ id: 5, name: 'Nutella', barcode: '3017620422003' });
  fs.refreshMemory();
  assert.deepEqual(names(last()), ['own:Nutella']);
});

// ── Row actions (edit-found-food) ────────────────────────────────────────

test('row actions: database products can be edited and saved, also while adding to a meal', () => {
  const off = { name: 'Moo milk', barcode: '111' };
  const usda = { name: 'Milk, whole', barcode: 'fdcId_1' };
  assert.deepEqual(foodItemActions(off), ['edit', 'save']);
  assert.deepEqual(foodItemActions(usda, { pickMode: true }), ['edit', 'save']);
  assert.deepEqual(foodItemActions(off, { foodsTab: false }), ['save']);
});

test('row actions: own foods are managed, shared foods are copied first', () => {
  const own = { id: 7, name: 'Milk 2.5%' };
  assert.deepEqual(foodItemActions(own), ['edit', 'select', 'delete']);
  assert.deepEqual(foodItemActions(own, { foodsTab: false }), ['edit', 'clone', 'select', 'delete']);
  assert.deepEqual(foodItemActions(own, { pickMode: true }), ['edit', 'delete']);
  assert.deepEqual(foodItemActions({ id: 9, name: 'x', _shared_by: 'ann' }), ['copy']);
});

test('database food: OFF and USDA results, not own, shared, imported or blank foods', () => {
  assert.equal(isDatabaseFood({ name: 'Moo milk', barcode: '111' }), true);
  assert.equal(isDatabaseFood({ name: 'Milk, whole', barcode: '', _source: 'usda' }), true);
  assert.equal(isDatabaseFood({ id: 7, name: 'Milk', barcode: '111' }), false);
  assert.equal(isDatabaseFood({ id: 9, name: 'x', barcode: '1', _shared_by: 'ann' }), false);
  assert.equal(isDatabaseFood({ name: 'Rice', barcode: '2', source_app: 'cooktrace' }), false);
  assert.equal(isDatabaseFood({ name: 'Homemade soup' }), false);
});
