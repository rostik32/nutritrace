# Proposal

## Why

The owner wants to download what they ate for a day, a week, a month or any chosen period, like the
FatSecret "Food Diary → Export" flow. Today the only diary exports live in Settings → Import & Export and
always cover the whole history; Statistics exports one metric per day, not the foods. Scripts have the
same gap: the public REST API reads one day at a time (range reads exist only as MCP tools), and diary
items carry only the meal index (`meal: 1`) and per-serving nutrition, so every consumer has to look up
meal names and multiply by `quantity` (and handle split recipes) on its own.

## What Changes

- **Export from the diary.** An "Export" button at the bottom of the diary's main column (after Day
  Notes, shown even when notes are hidden) opens a sheet with presets Today, Yesterday, Week (last 7 days
  including today), Month (last 30 days including today) and Select Period (From / To date fields). The
  resolved dates are shown under the presets. One action, "Export CSV", with a one-line hint that the file
  is a CSV table for Excel / Google Sheets / Numbers. No format choice (CSV only for now).
- **CSV shape.** Flat table, one row per diary item: Date, Meal (the user's meal name), Food, Brand,
  Amount (portion × quantity, as the diary shows it), Unit, then nutrient columns with units in the
  header. Nutrient columns follow the diary: the default set, or all built-in nutrients when "show all
  nutrients" is on, plus custom nutrients; columns empty across the whole period are left out. Values
  already include quantity. UTF-8 BOM so Excel shows Cyrillic, RFC 4180 quoting, empty cell = no value.
  Built on the device from only the chosen period: a new `NtApi.getDiaryRange(start, end)` in every
  mode (server, phone with a server, phone without one, browser offline mirror), so it works
  local-only and offline without downloading the whole diary.
- **REST range reads.** `GET /api/v1/diary?start=&end=` (items per day) and
  `GET /api/v1/diary/totals?start=&end=` (totals per day), inclusive `YYYY-MM-DD`, same defaults and
  366-logged-day limit as the MCP range tools, which they share code with.
- **Richer diary items in reads.** Every item returned by the diary reads (REST single day and range,
  MCP `list_diary_entries` and `list_diary_entries_range`) gains `meal_name` (from the user's meal names)
  and `totals` (nutrition with quantity applied, split recipes summed). Existing fields are unchanged.
- **Fix in Settings exports.** The simple "Export diary as CSV" breaks rows when a food name contains a
  quote; the full nutrition CSV writes the per-serving portion as Amount instead of portion × quantity.

Upstream: yes — period export, REST range reads and readable meal names are generic; offer them as a PR
against upstream `dev` (no fork-only files involved).

Out of scope: PDF export (postponed by the owner), a choice of report types, exporting water / body stats
/ activities, changing the Settings exports beyond the two fixes, editing or deleting through the REST API.

## Capabilities

### New Capabilities
- `diary-export`: exporting the food diary for a chosen period as a CSV file from the diary screen.
- `diary-api`: reading diary items and totals for a date range through the public REST API, with meal
  names and quantity-applied nutrition on each item.

### Modified Capabilities
<!-- none -->

## Impact

- Client: `getDiaryRange` in `src/lib/api.js`, `api-cached.js`, `api-native.js`, `offline-api.js` and
  `dbGetDiaryRange` in `db-native.js`; server `GET /api/diary` takes optional `start`/`end`.
- Client: new `src/lib/diary-export.js` (presets, CSV builder) and
  `src/components/diary/DiaryExportSheet.svelte`; `src/routes/Diary.svelte` (button + sheet);
  `src/components/settings/SettingsImportExport.svelte` (two fixes); `src/i18n/en.json`, `ru.json`.
- Server: new `server/lib/mcp/_diary-items.js`; `list-diary.js`, `list-diary-range.js`,
  `daily-totals-range.js` (core functions extracted); `server/routes/api/v1/diary.js` (two routes).
- Docs: `docs/public-api.md`.
- Tests: `scripts/diary-export.test.js` (presets, CSV), range/item fields in
  `scripts/mcp-range-integration.test.js`, wiring in `scripts/public-api-v1-wiring.test.js`.
