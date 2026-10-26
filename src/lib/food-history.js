/**
 * food-history.js
 *
 * The lists behind the add-to-meal picker's Recently Eaten, Most Eaten and
 * Saved tabs. Plain JS (no Svelte, no DOM) so it can be unit-tested.
 *
 * Nothing is stored for these lists. They are computed from the diary days
 * of the last 90 days, so every device shows the same history as its diary.
 * A product is one row per key (see productKey); the list order and the
 * quantity a product opens with come from its latest entry in the scope.
 */
import { foldText } from './search-text.js';

export const HISTORY_DAYS = 90;
export const HISTORY_FIRST = 5;
export const HISTORY_MORE = 20;

const _positiveId = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** First day of the window that ends on `today` (YYYY-MM-DD), today included. */
export function historyStart(today, days = HISTORY_DAYS) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - (days - 1))).toISOString().slice(0, 10);
}

/**
 * The key that makes two diary entries one product, in this order: the
 * catalog food id, then the normalized barcode, then source and external
 * id, then the folded name. Null when the entry has nothing to group by.
 */
export function productKey(item) {
  const catalog = _positiveId(item?.food_server_id);
  if (catalog) return 'cat:' + catalog;
  const barcode = String(item?.barcode ?? '').trim().replace(/^0+/, '');
  if (barcode) return 'bc:' + barcode;
  if (item?.source && item?.source_external_id != null && item.source_external_id !== '') {
    return 'ext:' + item.source + ':' + item.source_external_id;
  }
  const name = foldText(item?.name).trim();
  return name ? 'name:' + name : null;
}

// Recipes live in the meals table and quick calories have no food at all.
const _isFoodEntry = it =>
  !!it && !it.is_recipe && it.type !== 'quick_calories' && !!it.name;

// A food as the picker needs it, from one diary entry. Keeps the nutrition
// the entry was logged with; the catalog id is kept only when there is one.
function _snapshotFood(it) {
  const {
    uuid: _u, addedAt: _a, meal: _m, quantity: _q, totals: _t, meal_name: _n,
    food_server_id, server_id: _s, food_device: _d, id: _i, ...rest
  } = it;
  const catalog = _positiveId(food_server_id);
  return catalog ? { ...rest, id: catalog } : rest;
}

// The row a product opens with: portion, unit and servings from this entry.
function _rowFor(key, food, it) {
  const portion = Number(it.portion) > 0 ? Number(it.portion) : (Number(food.portion) || 100);
  const servings = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
  return { key, food, name: food.name, portion, unit: it.unit || food.unit || 'g', servings };
}

/**
 * The two history tabs for one meal. `days` is the diary as
 * [{ date, items }], any range (days outside the window are dropped).
 * `catalogById` maps a catalog id to the food object the picker already
 * holds, so history rows and the list share the same object.
 *
 * Returns { meal: { recent, most }, all: { recent, most } }. Each list holds
 * at most one row per product, so no product repeats within a block.
 */
export function buildFoodHistory(days, { meal = 0, today, catalogById = null } = {}) {
  const from = today ? historyStart(today) : '';
  const inWindow = (days || [])
    .filter(d => d?.date && (!today || (d.date >= from && d.date <= today)))
    .sort((a, b) => a.date.localeCompare(b.date));

  const foodByKey = new Map();
  const mealStats = new Map();
  const allStats = new Map();
  const bump = (stats, key, date, it) => {
    const s = stats.get(key) || { key, count: 0, lastDate: '', latest: null };
    s.count++;
    s.lastDate = date;
    s.latest = it;
    stats.set(key, s);
  };

  for (const day of inWindow) {
    for (const it of day.items || []) {
      if (!_isFoodEntry(it)) continue;
      const key = productKey(it);
      if (!key) continue;
      bump(allStats, key, day.date, it);
      if (Number(it.meal ?? 0) === Number(meal)) bump(mealStats, key, day.date, it);
    }
  }

  const rowOf = s => {
    if (!foodByKey.has(s.key)) {
      const snap = _snapshotFood(s.latest);
      const id = snap.id;
      foodByKey.set(s.key, (id && catalogById?.get(id)) || snap);
    }
    return { ..._rowFor(s.key, foodByKey.get(s.key), s.latest), count: s.count, lastDate: s.lastDate };
  };
  const recent = stats => [...stats.values()].map(rowOf)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
  const most = stats => [...stats.values()].map(rowOf)
    .sort((a, b) => (b.count - a.count) || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));

  return {
    meal: { recent: recent(mealStats), most: most(mealStats) },
    all: { recent: recent(allStats), most: most(allStats) },
  };
}

/**
 * Saved tab: the user's favorite foods, latest use first, then by name.
 * `foods` is the local catalog (meals are not in it).
 */
export function savedFoodRows(foods) {
  return (foods || [])
    .filter(f => f && f.favorite)
    .sort((a, b) => (b.last_used_at || '').localeCompare(a.last_used_at || '') || (a.name || '').localeCompare(b.name || ''))
    .map(food => ({
      key: 'cat:' + food.id,
      food,
      name: food.name,
      portion: Number(food.portion) || 100,
      unit: food.unit || 'g',
      servings: 1,
    }));
}

/** The first `shown` rows of a history list; the picker grows `shown` by HISTORY_MORE. */
export function visibleRows(list, shown) {
  return (list || []).slice(0, shown);
}
