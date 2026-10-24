/**
 * OFF name search asks search-a-licious for every language the user picked,
 * plus English. A user on the default (English only) must send exactly the
 * request they sent before multi-language support.
 *
 * _offSearchUrl is private to src/lib/api.js, so it is lifted out of the
 * source and run with the settings readers stubbed, like off-refresh.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { offSearchLangs } from '../src/lib/off-languages.js';

const src = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');

function slice(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not find ${from} in api.js`);
  return src.slice(a, b);
}

const body = slice('function _luceneEscape', '// Read the user\'s saved OFF languages');

function buildUrl(langSetting, country = null) {
  const make = new Function('offSearchLangs', '_getOffSearchCountry', '_getOffSearchLanguage',
    body + '\nreturn _offSearchUrl;');
  const fn = make(offSearchLangs, () => country, () => langSetting);
  return new URL(fn('сметана', 1, 50));
}

test('default English user: langs=en, as before', () => {
  const url = buildUrl('en');
  assert.equal(url.searchParams.get('langs'), 'en');
  assert.equal(url.searchParams.get('q'), 'сметана');
  assert.equal(url.searchParams.get('page_size'), '50');
});

test('a single non-English language also asks for English', () => {
  assert.equal(buildUrl('ru').searchParams.get('langs'), 'ru,en');
});

test('several languages are sent together, in the user order, plus English', () => {
  assert.equal(buildUrl('uk,ru,cs').searchParams.get('langs'), 'uk,ru,cs,en');
});

test('the country filter still goes into q', () => {
  assert.equal(buildUrl('uk,ru', 'en:ukraine').searchParams.get('q'), 'сметана +countries_tags:"en:ukraine"');
});
