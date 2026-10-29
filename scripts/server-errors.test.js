/**
 * src/lib/server-errors.js: the server answers `{ error: 'English text' }`;
 * localizeError shows a message it knows in the app language and passes
 * anything else through untouched (callers write `localizeError(x) || fallback`
 * and sometimes apply it twice).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
const ru = JSON.parse(readFileSync(new URL('../src/i18n/ru.json', import.meta.url), 'utf8'));
const src = readFileSync(new URL('../src/lib/server-errors.js', import.meta.url), 'utf8');
const lookup = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);

const { localizeError } = await import('../src/lib/server-errors.js');

test('before svelte-i18n is set up, every message comes back as it was', () => {
  assert.equal(localizeError('Invalid username or password'), 'Invalid username or password');
  assert.equal(localizeError('Too many requests. Try again in 5s.'), 'Too many requests. Try again in 5s.');
});

test('every key the map names exists in en.json and ru.json', () => {
  const keys = new Set();
  for (const m of src.matchAll(/^\s+(?:'(?:[^'\\]|\\.)*'|"[^"]*"): '([a-z_.]+)',$/gm)) keys.add(m[1]);
  for (const m of src.matchAll(/^\s+\[\/.*\/s?, '([a-z_]+)',/gm)) keys.add(m[1]);
  assert.ok(keys.size > 50, `found ${keys.size} keys`);
  for (const k of keys) {
    const path = k.includes('.') ? k : `server_errors.${k}`;
    assert.equal(typeof lookup(en, path), 'string', `en.json: ${path}`);
    assert.equal(typeof lookup(ru, path), 'string', `ru.json: ${path}`);
  }
});

test('in Russian, known messages are translated and unknown ones pass through', async () => {
  const { addMessages, init } = await import('svelte-i18n');
  addMessages('en', en);
  addMessages('ru', ru);
  init({ fallbackLocale: 'en', initialLocale: 'ru' });

  const known = localizeError('Invalid username or password');
  assert.equal(known, ru.server_errors.invalid_credentials);
  // Applying it twice changes nothing more.
  assert.equal(localizeError(known), known);

  assert.match(localizeError('Too many requests. Try again in 42s.'), /42/);
  assert.notEqual(localizeError('Too many requests. Try again in 42s.'), 'Too many requests. Try again in 42s.');
  // The dynamic part of a wrapped message is localized too.
  assert.equal(localizeError('Parse failed: Empty file'),
    ru.server_errors.parse_failed.replace('{error}', ru.server_errors.empty_file));

  for (const v of [null, undefined, '', 'Something nobody mapped']) assert.equal(localizeError(v), v);
});
