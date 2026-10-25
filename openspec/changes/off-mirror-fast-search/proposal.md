# Proposal

## Why

With the local OFF mirror enabled (`OFF_LOCAL_DB`, stock Hugging Face Parquet, 7.98 GB, 4.7 M products),
every name search takes 13–15 s and every barcode lookup about 5 s, so the mirror — the only way to find
Ukrainian and Czech products — is too slow for everyday logging. Measured on the diaitika server
(2026-10-25): the search runs two full scans of the Parquet file (hits and count) through `list_filter`
over every localized name, and a barcode lookup has to decode the large nested columns of the file.

## What Changes

- The server builds a compact search database next to the mirror (`<OFF_LOCAL_DB>.search.duckdb`):
  one native DuckDB table holding, per product, lower-cased names and brands for matching, the
  popularity key for ranking, and only the columns the app displays. Prototype: ~1.5 GB, built in
  about a minute, ranked match ~250 ms, page of 20 products ~160 ms.
- Name search and barcode lookup use this database whenever it is present and matches the current
  mirror file; otherwise they work exactly as today.
- The database is (re)built in the background on startup when it is missing or stale, and after every
  mirror refresh, with the same download-validate-rename pattern the mirror already uses; the old
  database keeps answering until the new one is ready.
- Search results stay the same: same matching (every token in any localized name, brand or barcode;
  accent-folded retry when nothing matches), same ordering (name starts with the query, then
  popularity, then code), same response shape, same multi-language naming.
- Setting `OFF_LOCAL_INDEX=off` disables the database and restores today's behaviour.

Upstream: yes — every self-hoster with the stock Parquet mirror gets the same 13 s searches; the change is
self-contained in `server/lib/off-local.js` and opt-out.

Out of scope: legacy native `.duckdb` mirrors (unchanged), remote search-a-licious, the country filter on
the mirror (still not applied), fuzzy or typo-tolerant search, full-text-search extensions, client-side
changes, the per-meal recent-foods idea (separate backlog item).

## Capabilities

### New Capabilities
- `off-local-mirror`: the local Open Food Facts mirror on the server — how it answers name searches and
  barcode lookups, how its search database is built, kept in step with mirror refreshes, and how it falls
  back when that database is missing.

### Modified Capabilities
<!-- none: off-food-search requirements (what is matched and how results are named) do not change -->

## Impact

- Server: `server/lib/off-local.js` (index build, freshness check, search and barcode queries, refresh
  hook, status), `server/index.js` startup only if needed. No route or response-shape changes.
- Disk: about 1.5 GB more next to the mirror, plus the same again while a rebuild runs.
- CPU/RAM: a one-minute DuckDB build after startup (when needed) and after each weekly refresh.
- Config: optional `OFF_LOCAL_INDEX` env var (`off` to disable); documented in `DEPLOY.md`.
- Tests: new `scripts/off-local-index.test.js` using a small generated Parquet file.
