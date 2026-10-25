# Design

## Context

What already exists (checked 2026-10-25):
- Settings → Import & Export has "Export diary as CSV" and "Export full nutrition CSV", both over
  `NtApi.getAllDiary()` (whole history) with a private `_downloadBlob` / `_nativeDownload` pair
  (Capacitor Filesystem → `Download/`).
- `NtApi` has no diary range read in any of its layers (`api.js`, `api-cached.js`, `api-native.js`,
  `offline-api.js`); only the IndexedDB wrapper has `getDiaryRange`.
- The diary shows an item's amount as `portion × quantity` rounded to 0.1 and nutrient chips filtered by
  `diaryShowAllNutrients ? all : NUTRIMENTS.default`. Meal names are the `mealNames` setting (synced to
  the server as `user_settings.mealNames`).
- MCP tools `list_diary_entries_range` / `get_daily_totals_range` hold their queries inline in the MCP
  handler; `list_diary_entries` / `get_daily_totals` already expose `xCore` functions used by REST.
- `Nutrition.calculate(item)` (src/lib/nutrition.js, browser-free) handles quantity and split recipes and
  is already imported by the server.

## Goals / Non-Goals

**Goals:** small diffs in upstream files; one CSV builder that is pure and unit-tested; REST range reads
that share code with MCP instead of a second copy.

**Non-Goals:** PDF, refactoring the Settings exports onto the new builder.

## Decisions

### 1. Data source for the export
Read only the chosen period. A year of diary is roughly 3–4 MB of JSON (0.3–1 KB per item), so loading
the whole history to export one week grows with every year of use. The owner chose the period read over
the smaller upstream diff of reusing `getAllDiary()`.
- Server: the app's own `GET /api/diary` takes optional `start` / `end` (inclusive, either may be left
  out, invalid → 400); without them it returns every day as before.
- `NtApi.getDiaryRange(start, end)` in each mode: HTTP (`api.js`), phone with a server (`api-cached.js`,
  local-first like `getAllDiary`), phone without one (`api-native.js`), both via new
  `dbGetDiaryRange` in `db-native.js` (SQL `date BETWEEN`, oldest first); the browser's offline wrapper
  (`offline-api.js`) replaces only that period's mirror rows online and answers from the mirror plus
  queued edits for that period offline.
- `buildDiaryCsv` still drops days outside the period, so a client on an older server (which ignores
  the query and sends every day) exports the right days.

### 2. `src/lib/diary-export.js` (pure)
- `presetRange(preset, today)` → `{start, end}` for `today | yesterday | week | month`
  (week = today − 6 … today, month = today − 29 … today), local dates as `YYYY-MM-DD`.
- `exportNutrientColumns({showAll, customNutriments})` → built-in columns (diary rule) + customs.
- `buildDiaryCsv(days, {start, end, mealNames, showAll, customNutriments})` → `{csv, rows}`;
  BOM + CRLF, RFC 4180 escaping, numbers with up to 2 decimals, empty columns dropped, rows sorted by
  date then meal index (stable within a meal).
- `diaryCsvFilename(start, end)` → `nutritrace-diary-<start>_<end>.csv` (single day: `-<date>.csv`),
  same prefix as the existing exports.
No browser imports, so `node --test` can import it.

### 3. Export sheet
`DiaryExportSheet.svelte` on the shared `Sheet`: preset chips; Select Period shows two `DateInput`s
(max today); the range line uses the user's locale; "Export CSV" button with a hint line under it.
Downloading copies the Settings pattern (blob link on web, Capacitor Filesystem to `Download/` on native)
inside the component — the Settings helpers are private and left untouched. Empty result → toast, no
file. The diary button sits after the `{#if $diaryShowNotes}` block, inside `.diary-main`, styled as a
secondary button with the `download` icon.

### 4. Server item details
New `server/lib/mcp/_diary-items.js`: `getMealNames(userId)` (reads `user_settings.mealNames`, defaults
to Breakfast/Lunch/Dinner/Snacks) and `withItemDetails(items, mealNames)` adding `meal_name` and `totals`
(`Nutrition.calculate`, rounded to 2 decimals, `_derived` dropped). Applied in `listDiaryCore` and the new
`listDiaryRangeCore`, so MCP and REST return the same items.

### 5. REST range routes
Extract `listDiaryRangeCore(userId, {start, end})` and `dailyTotalsRangeCore(userId, {start, end})`
(throwing `Error` on invalid input, as the other cores do); MCP handlers wrap them. In
`routes/api/v1/diary.js` register `GET /` and `GET /totals` before `GET /:date` (so `totals` is not read
as a date), both `requireScope('mcp:read')` and calling only the cores. Empty query values count as
omitted.

## Risks / Trade-offs

- Excel with a comma-decimal locale (e.g. Russian) may open a comma-separated file in one column; Google
  Sheets, Numbers and Excel's import wizard handle it. Same as FatSecret's file; revisit if it bites.
- Adding fields to MCP diary items slightly grows tool output; acceptable for the readability gained.
