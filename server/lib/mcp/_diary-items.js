/**
 * server/lib/mcp/_diary-items.js
 *
 * Read-side details added to every diary item the diary reads return
 * (MCP list_diary_entries / list_diary_entries_range and the matching
 * /api/v1/diary routes), so consumers don't have to re-implement them:
 *
 *   meal_name  the user's name for the item's meal slot (mealNames
 *              setting), instead of only the 0-based `meal` index.
 *   totals     the item's nutrition with quantity applied and split
 *              recipes summed, i.e. what the diary itself counts.
 *              `nutrition` stays per serving, unchanged.
 */
import db from '../../db.js';
import { Nutrition } from '../../../src/lib/nutrition.js';
import { safeJson } from './_util.js';

const DEFAULT_MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export function getMealNames(userId) {
  const row = db.prepare(
    `SELECT value FROM user_settings
      WHERE user_id = ? AND key = 'mealNames' AND deleted_at IS NULL`
  ).get(userId);
  const names = row?.value ? safeJson(row.value, null) : null;
  return Array.isArray(names) && names.length > 0 ? names : DEFAULT_MEAL_NAMES;
}

export function mealNameFor(meal, mealNames) {
  const idx = Number(meal) || 0;
  return mealNames[idx] || `Meal ${idx + 1}`;
}

export function withItemDetails(items, mealNames) {
  return items.map(item => {
    const totals = Nutrition.calculate(item);
    // Two decimals rather than the day totals' one, so small
    // micronutrient amounts (mcg) on a single item don't round to 0.
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
    return { ...item, meal_name: mealNameFor(item.meal, mealNames), totals };
  });
}
