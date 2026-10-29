/**
 * password-strength.js — lazy-loaded zxcvbn-ts wrapper.
 *
 * zxcvbn dictionaries are ~150 KB combined. Loading them up-front bloats
 * the main bundle, but a strength meter is only needed on a few password
 * inputs (Wizard, Profile, AcceptInvite, admin add-user). Dynamic-import
 * keeps them out of the initial chunk and behind a one-shot promise.
 *
 * Usage:
 *   import { estimate } from '../lib/password-strength.js';
 *   const result = await estimate('hunter2');
 *   // result = { score, feedback: { warning, suggestions }, crackTimes, ... }
 */

import { t } from './i18n-t.js';

let _ready = null;
let _zxcvbn = null;
let _options = null;
let _baseTranslations = null;

// zxcvbn's English feedback (from @zxcvbn-ts/language-en), keyed by its
// own ids. Kept here, small and static, so the meter can show it in the app
// language (password.zxcvbn.* keys) and server-errors.js can recognise the
// tip the server appends to "Password is too weak: …".
export const ZXCVBN_FEEDBACK_EN = {
  warnings: {
    straightRow: 'Straight rows of keys on your keyboard are easy to guess.',
    keyPattern: 'Short keyboard patterns are easy to guess.',
    simpleRepeat: 'Repeated characters like "aaa" are easy to guess.',
    extendedRepeat: 'Repeated character patterns like "abcabcabc" are easy to guess.',
    sequences: 'Common character sequences like "abc" are easy to guess.',
    recentYears: 'Recent years are easy to guess.',
    dates: 'Dates are easy to guess.',
    topTen: 'This is a heavily used password.',
    topHundred: 'This is a frequently used password.',
    common: 'This is a commonly used password.',
    similarToCommon: 'This is similar to a commonly used password.',
    wordByItself: 'Single words are easy to guess.',
    namesByThemselves: 'Single names or surnames are easy to guess.',
    commonNames: 'Common names and surnames are easy to guess.',
    userInputs: 'There should not be any personal or page related data.',
    pwned: 'Your password was exposed by a data breach on the Internet.',
  },
  suggestions: {
    l33t: "Avoid predictable letter substitutions like '@' for 'a'.",
    reverseWords: 'Avoid reversed spellings of common words.',
    allUppercase: 'Capitalize some, but not all letters.',
    capitalization: 'Capitalize more than the first letter.',
    dates: 'Avoid dates and years that are associated with you.',
    recentYears: 'Avoid recent years.',
    associatedYears: 'Avoid years that are associated with you.',
    sequences: 'Avoid common character sequences.',
    repeated: 'Avoid repeated words and characters.',
    longerKeyboardPattern: 'Use longer keyboard patterns and change typing direction multiple times.',
    anotherWord: 'Add more words that are less common.',
    useWords: 'Use multiple words, but avoid common phrases.',
    noNeed: 'You can create strong passwords without using symbols, numbers, or uppercase letters.',
    pwned: 'If you use this password elsewhere, you should change it.',
  },
};

/** i18n key for a zxcvbn feedback id: warnings.straightRow → password.zxcvbn.warnings.straight_row */
export function zxcvbnFeedbackKey(group, id) {
  return `password.zxcvbn.${group}.${id.replace(/[A-Z]/g, c => '_' + c.toLowerCase())}`;
}

// zxcvbn's translations object in the app language (English fallback).
function _feedbackTranslations(base) {
  const out = { ...base, warnings: {}, suggestions: {} };
  for (const group of ['warnings', 'suggestions']) {
    for (const [id, en] of Object.entries(ZXCVBN_FEEDBACK_EN[group])) {
      out[group][id] = t(zxcvbnFeedbackKey(group, id), null, en);
    }
  }
  return out;
}

async function _load() {
  if (_zxcvbn) return _zxcvbn;
  if (!_ready) {
    _ready = (async () => {
      const [{ zxcvbnOptions, zxcvbn }, common, en] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-en'),
      ]);
      zxcvbnOptions.setOptions({
        translations: en.translations,
        dictionary: { ...common.dictionary, ...en.dictionary },
        graphs: common.adjacencyGraphs,
      });
      _zxcvbn = zxcvbn;
      _options = zxcvbnOptions;
      _baseTranslations = en.translations;
      return zxcvbn;
    })();
  }
  return _ready;
}

/**
 * Estimate password strength.
 * @param {string} password
 * @param {string[]} [userInputs] — extra strings (username, email, name) to
 *   bias against. Anything in this list scores worse if echoed in the password.
 * @returns {Promise<{ score:0|1|2|3|4, feedback:{warning:string,suggestions:string[]} }>}
 */
export async function estimate(password, userInputs = []) {
  if (!password) return { score: 0, feedback: { warning: '', suggestions: [] } };
  const fn = await _load();
  // Feedback follows the app language; re-set each call so a language
  // switch shows up without a reload (a few dozen lookups, debounced).
  try { _options?.setOptions({ translations: _feedbackTranslations(_baseTranslations) }); } catch { /* keep English */ }
  return fn(password, userInputs);
}

/** Map score (0-4) → label. English only; the meter shows ui.password_strength.* instead. */
export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
export const STRENGTH_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#059669'];

/** Server-enforced minimum score when policy='strong'. zxcvbn 3 = "strong". */
export const STRONG_MIN_SCORE = 3;
