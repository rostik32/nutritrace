# Proposal

## Why

The Foods tab makes the user think about where a product lives before finding it. It opens on the whole
own catalog, which nobody needs when they came to find one product; it asks the user to pick a source
(All / My Foods / OFF / USDA / …) from a chip row, with quality filters hidden behind chip carets; and
"All" fans out to every database at once and lists results grouped by source. The owner wants one search
box that answers from the fastest, most relevant data first (own foods, then the server's OFF mirror) and
goes to slow online databases only when that finds nothing or when asked.

## What Changes

- **Empty start.** With an empty search box the Foods tab shows a short hint, not the own catalog.
- **One result list.** Own foods, foods shared with the user and Open Food Facts results (answered by the
  server: local mirror first, live OFF when the mirror has nothing) form one list without per-source
  sections or chips. Each row keeps a small source badge.
- **Online only when needed.** USDA, Mealie and CookTrace pantry (and live OFF when the mirror answered)
  are searched automatically only when the first step finds **zero** results. Otherwise a
  "Search online databases" button under the search field runs that step on demand and appends its
  results to the same list.
- **Pagination over the whole list.** One infinite scroll: the next page is requested about a screen
  before the end, one request at a time, and stops at the last page. Responses for an outdated query are
  ignored.
- **Filter button right of the search field.** Opens a panel (a sheet on phones, the left rail on wide
  screens) with: sources to include, sort order, OFF completeness and USDA data-type filters, and the own
  catalog category filter. Replaces the source chip row, the long-press multi-source chips and the chip
  caret dropdowns on the Foods tab.
- **Sort.** Relevance (new default), alphabetical, recently used, most used. Sort orders the own and shared
  matches, which come first; database results keep the order the database ranks them in.
- **Settings follow the UI.**
  - **BREAKING (settings):** `foodsDefaultSource` ("Default Search Source") is removed — the Foods tab
    has no source chips any more and Meals / Recipes start on My Foods as before.
  - `foodsSort` gains `relevance` and becomes the default sort of the Foods search; Settings → Foods
    offers it. The Meal editor's ingredient picker, which also reads `foodsSort`, treats `relevance`
    as alphabetical when nothing is typed.
  - `foodsShowCategories` now controls whether the category filter appears in the filter panel; its
    description is updated.
  - Unused i18n keys are dropped.
- Meals and Recipes tabs keep their current list and chips; the search pipeline is a separate module so
  they can adopt it later without rewriting it.

Upstream: no — it changes the Foods tab's whole interaction model and removes a setting upstream users
asked for (#128); offer it upstream as a discussion/idea after it has proven itself here.

Out of scope: a "My foods" browser for managing the whole own catalog (separate task), per-meal recent
foods (backlog item 2), editing nutrition of any found product (change `edit-found-food`), Meals and
Recipes tabs, barcode scanning, search ranking inside the OFF mirror or remote APIs, the Android offline
catalog beyond keeping today's "offline: only your own foods" behaviour.

## Capabilities

### New Capabilities
- `food-search`: how the Foods tab finds products — empty state, which sources answer and in what order,
  when online databases are queried, the single paginated result list, filters and sort, and the settings
  that configure them.

### Modified Capabilities
<!-- none: off-food-search (languages, naming) and off-local-mirror (server mirror) are unchanged -->

## Impact

- Client: `src/routes/Foods.svelte` (Foods tab rendering, chip row, All-mode state), new
  `src/lib/food-search.js` (pure search pipeline: tiers, merge, dedupe, own-match ranking, paging) and
  `src/components/foods/FoodSearchFilter.svelte` (filter panel), `src/routes/settings/Foods.svelte`,
  `src/routes/MealEditor.svelte` (one line: `relevance` sort), `src/stores/settings.js`
  (`foodsDefaultSource` store and synced key removed), `src/i18n/*.json`.
- Server: none. Live OFF on demand uses the existing `/api/proxy?...&live=1` flag (ignored under
  `OFF_LOCAL_ONLY`).
- Tests: new `scripts/food-search.test.js` for the pipeline.
- Upstream merges: `Foods.svelte` diff is large; the pipeline and filter live in new files to keep it as
  small as possible.
