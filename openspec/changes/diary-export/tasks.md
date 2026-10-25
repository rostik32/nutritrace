# Tasks

## 1. Server

- [x] 1.1 Add `server/lib/mcp/_diary-items.js` (meal names + per-item totals) and use it in `listDiaryCore`; verify with a unit test that an item with quantity 1.5 gets `meal_name` and `totals.calories` 247.5
- [x] 1.2 Extract `listDiaryRangeCore` / `dailyTotalsRangeCore`, keep the MCP tools on them; verify `scripts/mcp-range-integration.test.js` passes and covers the new item fields
- [x] 1.3 Add `GET /api/v1/diary` and `GET /api/v1/diary/totals` with `start`/`end`; extend `scripts/public-api-v1-wiring.test.js`; document in `docs/public-api.md`

## 2. Client

- [x] 2.1 Add `src/lib/diary-export.js` with tests in `scripts/diary-export.test.js` (presets, amount, quantity, escaping, BOM, dropped columns, file name)
- [x] 2.2 Add `DiaryExportSheet.svelte` and the diary button; strings in `src/i18n/en.json` + `ru.json`; verify `npm run i18n:check`
- [x] 2.3 Fix quoting in Settings "Export diary as CSV" and Amount in "Export full nutrition CSV"

## 2b. Period read (owner's follow-up)

- [x] 2.4 `GET /api/diary?start=&end=`; `getDiaryRange` in all four API layers + `dbGetDiaryRange`; the export sheet uses it; verify with a case in `scripts/android-sync.test.js` (server route, phone with a server online and offline, phone without a server) and the wiring in `scripts/offline-wiring.test.js`

## 3. Integration

- [x] 3.1 Run `npm test`, `npm run i18n:check`, `npm run build`; walk the spec scenarios in a local production build (phone viewport) and call the REST routes with a token

## Verification notes

2026-10-25, Node 20: `npm test` 960/960 (incl. new `diary-export.test.js` and range/item checks in
`mcp-range-integration.test.js`), `npm run i18n:check` passes (ru: no new missing keys), `npm run build` ok.

Walked in a local production build on an isolated copy of the dev DB (port 3011, `PUBLIC_API_ENABLED=1`):
- Phone viewport: "Export" sits after Day Notes; sheet shows Today / Yesterday / Week (19 Oct – 25 Oct) /
  Month (26 Sept – 25 Oct) / Select Period with From/To; To before From cannot be entered (DateInput min/max).
- Week export: file `nutritrace-diary-2026-10-19_2026-10-25.csv`, starts with bytes EF BB BF, rows match the
  diary (Lunch nutella 30 g 162.15 kcal), absent values are empty cells. Yesterday (nothing logged): toast
  "No diary entries for this period", no file, sheet stays open.
- Russian UI: labels fit, range label follows the app language ("19 окт. – 25 окт."); active chip no longer
  bolds (a wider chip re-wrapped the row). Desktop width: button spans the main column under the meals.
- REST with an `mcp:read` token: `/api/v1/diary?start&end` returns entries with `meal_name` + `totals`,
  `/api/v1/diary/totals?start&end` per-day totals, `/:date` and `/:date/totals` unchanged apart from the two
  item fields; reversed range / 2026-02-31 / repeated `start` → 400, empty params → last 90 days, no token → 401.
- Period read (follow-up): the export sends `GET /api/diary?start=2026-10-19&end=2026-10-25`; with the
  server stopped (page still open) the same export answers from the offline mirror, same 4 rows. Phone
  modes covered by the new case in `scripts/android-sync.test.js` (real server + phone harness).
- Not checked on a device: Android save to Downloads (same Filesystem call as the Settings exports).

## Workflow follow-up

- Open a PR into `diaitika`; deploy per the runbook.
- Offer upstream as a separate PR against `TraceApps/nutritrace:dev`.
- Archive the change after merge (`/opsx:archive`).
