#!/usr/bin/env node
/**
 * i18n-required — the fork's languages must be complete (diaitika only).
 *
 * Usage:  node diaitika/i18n-required.cjs            (checks ru, uk)
 *         node diaitika/i18n-required.cjs ru uk de   (any list)
 *
 * Upstream's `npm run i18n:check` only reports missing translations, because
 * upstream translates on Weblate at its own pace. This fork ships every
 * user-facing text in English, Russian and Ukrainian in the same PR
 * (AGENTS.md → Localization, diaitika-infra ADR 0016), so CI fails when one of
 * the required locales is behind en.json.
 *
 * For each required locale it fails on:
 *   - keys in en.json that are missing, or keys that en.json doesn't have;
 *   - empty values, or a string where en.json has a section (or the reverse);
 *   - ICU messages that don't parse;
 *   - arguments ({name}, {count, plural, …}) that differ from the English;
 *   - plurals without the forms the language needs (ru/uk: one, few, many).
 */
const fs = require('fs');
const path = require('path');
const { IntlMessageFormat } = require('intl-messageformat');
const { flatten } = require('../scripts/i18n-check.cjs');

const I18N_DIR = path.join(__dirname, '..', 'src', 'i18n');
const REQUIRED = process.argv.slice(2).length ? process.argv.slice(2) : ['ru', 'uk'];

// Plural categories a message must cover beyond `other` (which ICU requires).
const PLURAL_FORMS = {
  ru: ['one', 'few', 'many'],
  uk: ['one', 'few', 'many'],
};

const ARG_TYPES = new Set([1, 2, 3, 4, 5, 6]); // argument, number, date, time, select, plural
const PLURAL = 6;

function load(code) {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${code}.json`), 'utf8'));
}

function parse(message, locale) {
  return new IntlMessageFormat(message, locale, undefined, { ignoreTag: true }).getAst();
}

/** Argument names used anywhere in the message, and every plural element. */
function walk(ast, out = { args: new Set(), plurals: [] }) {
  for (const el of ast) {
    if (ARG_TYPES.has(el.type)) out.args.add(el.value);
    if (el.type === PLURAL) out.plurals.push(el);
    if (el.options) for (const opt of Object.values(el.options)) walk(opt.value, out);
    if (el.children) walk(el.children, out);
  }
  return out;
}

function main() {
  const en = flatten(load('en'));
  const problems = [];
  const report = (code, key, msg) => problems.push(`${code}: ${key} — ${msg}`);

  for (const code of REQUIRED) {
    let loc;
    try { loc = flatten(load(code)); } catch (e) { report(code, '*', `cannot read ${code}.json: ${e.message}`); continue; }

    for (const key of Object.keys(en)) if (!(key in loc)) report(code, key, 'missing');
    for (const key of Object.keys(loc)) if (!(key in en)) report(code, key, 'not in en.json');

    for (const [key, value] of Object.entries(loc)) {
      if (!(key in en)) continue;
      if (typeof value !== 'string' || typeof en[key] !== 'string') {
        if (typeof value !== typeof en[key]) report(code, key, 'type differs from en.json');
        continue;
      }
      if (!value.trim()) { report(code, key, 'empty'); continue; }

      let ours, theirs;
      try { ours = walk(parse(value, code)); } catch (e) { report(code, key, `ICU does not parse: ${e.message}`); continue; }
      try { theirs = walk(parse(en[key], 'en')); } catch { continue; } // i18n:check owns en.json

      const a = [...ours.args].sort().join(', ');
      const b = [...theirs.args].sort().join(', ');
      if (a !== b) report(code, key, `arguments {${a}} differ from English {${b}}`);

      for (const el of ours.plurals) {
        const have = Object.keys(el.options);
        const exact = have.some(o => o.startsWith('='));
        const lacking = (PLURAL_FORMS[code] || []).filter(f => !have.includes(f));
        // A plural with only exact cases (=0) plus `other` is a deliberate pattern, not a word form.
        if (lacking.length && !(exact && have.length === have.filter(o => o.startsWith('=')).length + 1)) {
          report(code, key, `plural {${el.value}} lacks ${lacking.join(', ')}`);
        }
      }
    }
  }

  const total = Object.keys(en).length;
  if (problems.length) {
    console.log(`\ni18n-required: ${problems.length} problem(s) in ${REQUIRED.join(', ')} (en.json has ${total} keys)\n`);
    for (const p of problems.slice(0, 200)) console.log(`  ✗ ${p}`);
    if (problems.length > 200) console.log(`  … and ${problems.length - 200} more`);
    console.log('\n  Every user-facing string ships in en, ru and uk in the same PR (AGENTS.md → Localization).\n');
    process.exit(1);
  }
  console.log(`i18n-required: ${REQUIRED.join(', ')} complete (${total} keys, ICU and arguments match en.json)`);
}

main();
