/**
 * default-names.js — show the built-in default names in the app language.
 *
 * Meal slots and water containers start with English names that are stored
 * as settings. A name is shown translated only while it is still exactly one
 * of those defaults; a name the user typed is shown as typed. The stored
 * value is never changed.
 */
import { t } from './i18n-t.js';

export const DEFAULT_MEAL_NAMES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

const MEAL_KEYS = { Breakfast: 'breakfast', Lunch: 'lunch', Dinner: 'dinner', Snacks: 'snacks' };
const CONTAINER_KEYS = {
  'Small Bottle': 'small_bottle',
  'Standard Bottle': 'standard_bottle',
  'Large Bottle': 'large_bottle',
  'Gallon Jug': 'gallon_jug',
};

export function displayMealName(name) {
  const key = MEAL_KEYS[name];
  return key ? t(`meal_names.${key}`, null, name) : name;
}

export function displayContainerName(name) {
  const key = CONTAINER_KEYS[name];
  return key ? t(`water_containers.${key}`, null, name) : name;
}
