/** Returns a Material Symbols icon name based on keywords in the meal name */
export function mealIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('breakfast') || n.includes('morning') || n.includes('brunch')
      || n.includes('завтрак') || n.includes('сніданок')) return 'free_breakfast';
  if (n.includes('lunch') || n.includes('noon') || n.includes('midday')
      || n.includes('обед') || n.includes('обід')) return 'lunch_dining';
  if (n.includes('dinner') || n.includes('supper') || n.includes('evening')
      || n.includes('ужин') || n.includes('вечер')) return 'dinner_dining';
  if (n.includes('snack') || n.includes('bite') || n.includes('treat')
      || n.includes('перекус')) return 'cookie';
  if (n.includes('drink') || n.includes('smoothie') || n.includes('shake')) return 'local_cafe';
  return 'restaurant';
}

/** Accent color per meal slot; cycles for any number of meals */
export const MEAL_COLORS = ['#FFB347','#4FFFB0','#4FC3F7','#CE93D8','#FF7070','#80DEEA','#C5E1A5','#FFD54F','#FF80AB','#B39DDB'];
export const mealColor = i => MEAL_COLORS[i % MEAL_COLORS.length];
