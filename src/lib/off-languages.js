/**
 * off-languages.js: the user's Open Food Facts languages, in order.
 *
 * The `offSearchLanguage` setting used to hold one two-letter code ("ru").
 * It now holds an ordered, comma-separated list ("uk,ru,cs"): the primary
 * language first, then the extra languages searched alongside it. The key and
 * the string type stay the same, so nothing has to be migrated, and an older
 * app that reads only the first two characters still gets the primary one.
 */

const CODE = /^[a-z]{2}$/;

/**
 * @param {unknown} value  stored setting: "ru", "uk,ru,cs", or anything else
 * @returns {string[]}     lower-case two-letter codes, de-duplicated, order
 *                         kept; ['en'] when nothing usable is there
 */
export function parseOffLanguages(value) {
  const out = [];
  for (const part of String(value ?? '').split(',')) {
    const code = part.trim().toLowerCase().slice(0, 2);
    if (CODE.test(code) && !out.includes(code)) out.push(code);
  }
  return out.length ? out : ['en'];
}

/** The inverse of parseOffLanguages: what goes back into the setting. */
export function serializeOffLanguages(langs) {
  return parseOffLanguages((Array.isArray(langs) ? langs : [langs]).join(',')).join(',');
}

/**
 * Languages to ask OFF search for: the user's list plus English. English also
 * matches names stored in a product's main language, so it stays in even
 * when the user did not pick it.
 */
export function offSearchLangs(value) {
  const langs = parseOffLanguages(value);
  return langs.includes('en') ? langs : [...langs, 'en'];
}
