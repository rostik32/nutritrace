/**
 * i18n-t.js — translate from plain JS modules (stores, lib helpers).
 *
 * Components use the `$_` store; modules call `t(key, values, fallback)`,
 * which reads the svelte-i18n formatter at call time, so the text follows
 * the language active when the message is built.
 *
 * svelte-i18n throws until a locale is set (node --test, very early boot).
 * Then `t` returns `fallback` (with `{name}` placeholders filled from
 * `values`) or, without one, the key itself.
 */
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

function _fill(text, values) {
  if (!values) return text;
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

export function t(key, values, fallback) {
  try {
    const opts = {};
    if (values) opts.values = values;
    if (fallback !== undefined) opts.default = fallback;
    return get(_)(key, opts);
  } catch {
    return fallback !== undefined ? _fill(fallback, values) : key;
  }
}
