# Tasks

## 1. Build the search database

- [ ] 1.1 Add the index builder to `server/lib/off-local.js` (table `search_products` + `meta` per design D2,
      display columns chosen from those present in the snapshot, written to `<index>.new`, validated, renamed);
      verify with a new `scripts/off-local-index.test.js` that builds from a generated Parquet fixture and checks
      row count, `meta` and the folded columns (NULL when equal).
- [ ] 1.2 Add `OFF_LOCAL_INDEX=off` and the legacy-`.duckdb` skip; verify in the test that neither case builds
      or reads an index file.

## 2. Use it for name search and barcode lookup

- [ ] 2.1 Attach a fresh or stale index `READ_ONLY` in `_init()` (design D4/D5) and route `searchByName` through
      the two-step query (D3), keeping the exact pass, folded retry, rank, popularity tiebreak, code tiebreak,
      COUNT and `langs` naming; verify with parity tests that run the same queries with and without the index
      on the fixture (multi-word in any order, Cyrillic, accents, brand-only and barcode matches, ranking ties,
      pages 1–3 without gaps or duplicates) and get identical responses.
- [ ] 2.2 Route `lookupByBarcode` (including the UPC-A retry) through the index; verify a parity test for a hit,
      a miss and a 12-digit code.
- [ ] 2.3 Keep `scripts/off-local-langs.test.js` and the rest of `npm test` green on Node 20 (no background
      build is started by a plain search); verify `npm test` and `npm run i18n:check` pass.

## 3. Keep it in step with the mirror

- [ ] 3.1 Build from `primeFromStartup()` when the index is missing or not fresh, and after a successful
      `_runRefresh()`; single-flight; swap with DETACH/ATTACH through the query queue; verify with a test that
      changes the fixture file, triggers a rebuild, keeps serving the old index meanwhile and then serves the
      new data.
- [ ] 3.2 Leave the old index in place when a build fails and delete stale `<index>.new` files; verify with a
      test that forces a build error.
- [ ] 3.3 Add `search_index` to `getStatus()` and log lines for build start/ready/failed; verify the status test
      shows `building` during a build and `ready` after.
- [ ] 3.4 Document the index (file, size, build time, `OFF_LOCAL_INDEX`, rollback) in `DEPLOY.md` next to the
      `OFF_LOCAL_DB` section and update the header comment of `off-local.js`; verify the text matches the code.

## 4. Verify on the real mirror

- [ ] 4.1 On the diaitika server, run the branch's `off-local.js` inside the running container against the
      real mirror with the index written to a temporary directory (no production files touched): record build
      time and size, and time "картопля", "сир кисломолочний", "tvaroh", "milk", "nutella", "creme fraiche"
      and three barcode lookups; verify each is under 1 s and hit counts match the unindexed search; remove the
      temporary files.
- [ ] 4.2 Tune build threads/memory if the build disturbs the running app (design open question) and record
      the numbers in the PR description.

## Workflow follow-up

- Open a PR into `diaitika`; owner merges.
- Deploy with the diaitika-infra runbook (backup first), confirm `search_index.state = ready` and search speed
  in the app.
- `/opsx:archive off-mirror-fast-search`; record the day in `diaitika-infra/docs/history/`.
- Offer upstream (PR against `TraceApps/nutritrace:dev`) after a week in production.
