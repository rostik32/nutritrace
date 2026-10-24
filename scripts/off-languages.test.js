/**
 * The OFF language setting holds an ordered list ("uk,ru,cs") instead of one
 * code. Old single values must keep meaning exactly what they meant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOffLanguages, serializeOffLanguages, offSearchLangs } from '../src/lib/off-languages.js';

test('a single stored language is a one-element list', () => {
  assert.deepEqual(parseOffLanguages('ru'), ['ru']);
  assert.deepEqual(parseOffLanguages('en'), ['en']);
});

test('a list keeps its order', () => {
  assert.deepEqual(parseOffLanguages('uk,ru,cs'), ['uk', 'ru', 'cs']);
  assert.deepEqual(parseOffLanguages(' UK , ru ,cs '), ['uk', 'ru', 'cs']);
});

test('duplicates and junk are dropped', () => {
  assert.deepEqual(parseOffLanguages('uk,uk,ru'), ['uk', 'ru']);
  assert.deepEqual(parseOffLanguages('uk,,1,r,ru'), ['uk', 'ru']);
  assert.deepEqual(parseOffLanguages('pt-BR'), ['pt'], 'regional codes fold to the language');
});

test('nothing usable means English, the old default', () => {
  for (const v of [undefined, null, '', ',', '12', {}]) assert.deepEqual(parseOffLanguages(v), ['en']);
});

test('the stored string is what an older client slices to its primary language', () => {
  const stored = serializeOffLanguages(['uk', 'ru', 'cs']);
  assert.equal(stored, 'uk,ru,cs');
  assert.equal(stored.slice(0, 2), 'uk', 'old api.js read lang.slice(0, 2)');
  assert.equal(serializeOffLanguages('ru'), 'ru');
});

test('search always includes English, without changing the default request', () => {
  assert.deepEqual(offSearchLangs('en'), ['en']);
  assert.deepEqual(offSearchLangs(''), ['en']);
  assert.deepEqual(offSearchLangs('ru'), ['ru', 'en']);
  assert.deepEqual(offSearchLangs('uk,en,ru'), ['uk', 'en', 'ru']);
});
