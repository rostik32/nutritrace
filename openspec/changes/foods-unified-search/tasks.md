# Tasks

## 1. Search pipeline module

- [ ] 1.1 Create `src/lib/food-search.js` with source descriptors and tiers (design D1) and verify `scripts/food-search.test.js` covers: tier 1 only when it has results, automatic tier 2 on zero raw results, no automatic tier 2 when results are only hidden by filters
- [ ] 1.2 Add the single cursor over ordered sources (D2): `loadMore()` pages the first source with pages left, ignores calls while a page is in flight, stops at the end; verify with fake sources in the test file
- [ ] 1.3 Add barcode / source-id dedupe (D3), including own-food barcodes hiding database rows; verify with tests (mirror + live OFF same barcode → one row; own food barcode → database row hidden)
- [ ] 1.4 Add the generation guard (D4); verify a test where the response for an earlier query arrives last and is discarded
- [ ] 1.5 Move own-match filtering and sorting into the module (D5): accent folding via `search-text.js`, edit-distance fallback, relevance / alpha / recent / most; verify tests for each order (spec "Sort order" scenarios) and that `npm test` passes

## 2. Filter panel

- [ ] 2.1 Create `src/components/foods/FoodSearchFilter.svelte` (sources, sort, OFF completeness, USDA data types, category) with all strings in `src/i18n/en.json`; verify `npm run i18n:check` passes
- [ ] 2.2 Add the synced setting `foodsSearchExcluded` (store + `USER_PREFS`) and persist sort to `foodsSort`; verify excluding a source survives a reload in the local build

## 3. Foods tab

- [ ] 3.1 Replace the Foods-tab branches in `src/routes/Foods.svelte` (own list, single-source, "All") with one list rendered from the pipeline; empty query shows the hint; verify in the local build (phone viewport) that the tab opens with the hint and no rows, and that "milk" lists own foods first with source badges
- [ ] 3.2 Rows for every source with pick-mode checkboxes, long-press for own and shared rows, manage mode on own rows (D10); verify adding a ticked OFF row and an own row to a meal in one go, and bulk delete of own rows from results
- [ ] 3.3 Filter button in the search row (sheet on phones) and inline panel in the wide-screen rail; remove the source chip row, `pinnedSources` and tier dropdowns for the Foods tab; verify at 375 px and 1440 px widths, and that Meals / Recipes still show their chips and lists
- [ ] 3.4 "Search online databases" button under the search row and in the empty state (D9) using `live: true` for OFF; verify: shown after mirror results, appends USDA + live OFF without duplicates, hidden after use, hidden when no tier-2 source is available
- [ ] 3.5 Infinite scroll with a one-viewport `rootMargin` sentinel (D6); verify in the browser that no page loads without scrolling and exactly one page loads per approach to the end
- [ ] 3.6 Offline behaviour: only own foods searched, existing offline hint shown, no online button; verify with the browser set offline

## 4. Settings and cleanup

- [ ] 4.1 Remove `foodsDefaultSource` (store, `USER_PREFS`, Settings → Foods row, i18n keys) and initialise Meals / Recipes to My Foods; verify `grep -rn foodsDefaultSource src` is empty and both tabs open on My Foods
- [ ] 4.2 Add `relevance` to `foodsSort` (new default, Settings → Foods option) and map it to alphabetical in the Meal editor picker; verify the settings page and the Meal editor ingredient picker in the local build
- [ ] 4.3 Update the `foodsShowCategories` description and drop i18n keys no longer used (source chips, "All" mode, per-source pagination strings); add Russian translations for new keys; verify `npm run i18n:check` and that no removed key is still referenced

## 5. Integration

- [ ] 5.1 Run `npm test`, `npm run i18n:check` and `npm run build` on Node 20 and verify all pass
- [ ] 5.2 Walk the spec scenarios in a local production build (phone viewport, public OFF) and note any deviation in the PR description

## Workflow follow-up

- Open a PR into `diaitika`; after merge, deploy per `diaitika-infra/docs/runbooks/update-nutritrace.md` and check search on the server with the mirror.
- Archive the change after merge (`/opsx:archive`).
