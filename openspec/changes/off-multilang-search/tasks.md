# Tasks

## 1. Language preference parsing

- [x] 1.1 Add `src/lib/off-languages.js` with `parseOffLanguages()` / `serializeOffLanguages()` and unit tests in `scripts/off-languages.test.js` (single value, list, junk, duplicates, empty → `['en']`); verify `node --test scripts/off-languages.test.js` passes

## 2. Remote search

- [x] 2.1 Use the parsed list in `_offSearchUrl` (`langs` = list + `en`), with a test asserting the URL for `en`, `ru` and `uk,ru,cs`; verify the default request is byte-identical to before
- [x] 2.2 Add Ukraine and Czech Republic to the country filter and Ukrainian/Czech to the language options; verify `npm run i18n:check` passes

## 3. Result naming

- [x] 3.1 Generalise `offProductName(p, langs)` to a language list (string still accepted) and extend `scripts/off-name.test.js` with the spec scenarios; verify all off-name tests pass, including the unchanged-default cases
- [x] 3.2 Pass the request's `langs` from `server/routes/proxy.js` through `searchByName` to `_extractLocalized`, with a test on `_toOffProduct` naming order; verify `npm test` passes

## 4. Settings UI

- [x] 4.1 Primary language select + "Also search in" checkboxes in `ConnectedServices.svelte`, strings in `src/i18n/en.json`; verify in the local dev app that saving `uk` + `ru,cs` stores `uk,ru,cs` and reloads correctly

## 5. Integration check

- [x] 5.1 Local dev app: with languages `uk,ru` search "сметана", "сир кисломолочний", "tvaroh" and confirm more hits than with `en` and Ukrainian/Russian names shown; record numbers in the PR description

## Workflow follow-up

- Open a PR `feat/off-multilang-search` → `diaitika`; CI must pass; owner reviews and merges.
- After the image builds, deploy per diaitika-infra runbook and enable the local OFF mirror on the server.
- Archive this change (`/opsx:archive`) after deployment; consider an upstream PR against `TraceApps/nutritrace:dev`.
