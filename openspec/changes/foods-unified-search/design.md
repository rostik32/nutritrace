# Design

## Context

`src/routes/Foods.svelte` (~4 000 lines) renders three result modes on the Foods tab, picked by
`searchSource`: the own/shared list (`filteredList`, alphabetical/recent/most via `_applySort`, shown
even with an empty query), single external sources (`apiResults` + `loadMoreExternal`, 50 per page), and
"All" (`_allModeItems`: local + shared filtered in memory, then per-source arrays for Mealie, CookTrace,
OFF and USDA, each with its own page/hasMore/total, `loadMoreAll`, 20 per page). Source chips with
long-press multi-select (`pinnedSources`) and caret dropdowns for the OFF/USDA tier filters sit in a chip
row on phones and in a left rail (`.foods-filter-rail`) at ≥1280 px.

Checked on a local build (2026-10-25): the infinite scroll works as designed — nothing loads without
scrolling, one page per scroll. The redesign replaces it rather than fixing it.

Useful facts:
- OFF name search goes through `/api/proxy`; the server answers from the mirror when `OFF_LOCAL_DB` is set
  and falls through to live OFF when the mirror has zero hits (unless `OFF_LOCAL_ONLY`). `&live=1` skips the
  mirror; `_extFetch(url, { live: true })` already sends it. `envLocks.off_local` / `off_local_only` tell
  the client whether a mirror is configured and whether live OFF is forbidden.
- The "All" mode list already renders one `<ul>` with source badges; pick-mode checkboxes and long-press
  exist only on the own list and the single-source list.
- `foodsSort` is also read by the Meal editor's ingredient picker; `foodsDefaultSource` only by
  `Foods.svelte` and Settings → Foods; both are in the synced `USER_PREFS` list.
- Own-food matching (`_fuzzyMatch`) does substring, all-words and edit-distance-1 matching without accent
  folding; `src/lib/search-text.js` has the shared folding helpers.

## Goals / Non-Goals

**Goals:**
- One search pipeline in a plain JS module with no Svelte or DOM dependency, unit-tested with `node --test`,
  that a future Meals / Recipes rework can reuse by passing different sources.
- `Foods.svelte` keeps owning rendering and pick/manage actions; its Foods-tab branch shrinks to "render
  the pipeline's rows".
- No server changes.

**Non-Goals:**
- Changing how OFF, USDA, Mealie or CookTrace rank their own results.
- Touching the Meals / Recipes branches beyond keeping them working.

## Decisions

### 1. Source tiers in a pipeline module (`src/lib/food-search.js`)
Each source is a descriptor `{ id, tier, enabled, fetchPage(query, page, ctx) | match(query) }`:
- tier 1: `own` and `shared` (in memory, `match`), `off` (proxy, mirror-first, page size 30);
- tier 2: `usda`, `mealie`, `ctpantry`, `off-live` (same OFF fetch with `live: true`; only offered when
  `envLocks.off_local && !envLocks.off_local_only` — without a mirror, tier-1 OFF already is live OFF).

The module exposes a small state machine: `start(query)` runs tier 1; if its raw result count is 0 (before
quality filters) it runs tier 2 automatically; `searchOnline()` runs tier 2 on demand; `loadMore()` fetches
the next page. The page sees `{ rows, phase, loading, hasMore, onlineAvailable, onlineDone, hiddenByFilter }`.
Alternative: keep the logic in `Foods.svelte` reactive blocks — rejected, it is the reason the file has five
parallel sets of page/hasMore/total variables and cannot be tested.

### 2. One cursor over an ordered list of sources
Rows are ordered by tier, then by source order inside a tier (own, shared, off; then off-live, usda,
mealie, ctpantry), then by each source's own order. `loadMore()` asks the first source that still has
pages for its next page, so the list only ever grows at the end and pages never interleave. Own and shared
are complete after `start`. Alternative: request a page from every source per scroll and merge — rejected,
it reorders rows already on screen and multiplies requests.

### 3. Dedupe by barcode, then by source id
A key `barcode` (when present) else `source:id` is kept in a Set per search; rows whose key is already
present are dropped on append. Own foods register their barcode, so a mirror/live row with the same
barcode as an own food is hidden (the own copy is what the user curated).

### 4. Stale-response guard
Every `start` increments a generation number; fetches capture it and drop their result when it no longer
matches. The 400 ms debounce stays in the page.

### 5. Own-match ranking
Matching: accent-folded with `search-text.js` (`coversFolded` for all words), plus today's
edit-distance-1 word fallback. Relevance order: favorite, name starts with the query, a word starts with
the query, substring, fuzzy; ties by `usage_count`, then name. Alphabetical / recent / most reuse today's
`_applySort` rules (moved into the module). Database rows are never re-sorted (Decision 2).

### 6. Infinite scroll trigger
Keep the existing `IntersectionObserver` action but use `rootMargin` of one viewport height
(`${innerHeight}px`) and a single sentinel after the list, rendered while `hasMore`. The module ignores
`loadMore()` while a page is in flight, so a sentinel re-entering view cannot double-fire.

### 7. Filter panel component
`src/components/foods/FoodSearchFilter.svelte` renders: sources (toggles for the enabled tier-1/tier-2
sources), sort (radio), OFF completeness tiers and USDA data types (existing buckets), category (when
`foodsShowCategories` and categories exist). Phones: opened from a filter icon button inside the search
row, shown in the existing `Sheet` component. Wide screens (rail mode): the same component rendered inline
in `.foods-filter-rail`, no button. A dot on the button when anything differs from defaults.
Excluded sources persist in a new synced setting `foodsSearchExcluded` (array of source ids, default
`[]`); sort persists in `foodsSort`; quality and category filters are per session, as today.
Alternative: a separate full page — rejected, too heavy for two or three taps.

### 8. Settings
- Remove `foodsDefaultSource`: store, `USER_PREFS` entry, Settings → Foods row, i18n keys. Stored values on
  the server stay in `user_settings` and are ignored. Meals / Recipes initialise `searchSource` to `'local'`.
- `foodsSort` default becomes `relevance`; Settings → Foods adds the option; the Meal editor picker maps
  `relevance` to alphabetical (it has no query-relevance ranking).
- `foodsShowCategories` description: "Category filter in the Foods search filter".

### 9. "Search online databases" button
Rendered as a compact text button directly under the search row while `onlineAvailable && !onlineDone &&
rows.length > 0` (and online). Under the "no results" empty state the same action appears only if tier 2 was
not queried (e.g. all tier-2 sources excluded in the filter → not shown).

### 10. Rows
One row component path in `Foods.svelte` for every source: thumbnail, name (+ OFF origin flag), brand,
energy or "no values listed" for OFF, OFF completeness dot / USDA type badge, source badge, favorite mark
for own foods. Pick mode: the checkbox column for food rows of any source (today's `_resolveOffPicks`
already handles ticked OFF rows). Long-press: own rows open today's action sheet (Edit / Select multiple /
Delete); shared rows "Save to my catalog"; database rows unchanged here (see `edit-found-food`).
Manage mode works on own rows visible in the current results.

## Risks / Trade-offs

- [Large diff in an upstream file] → pipeline, ranking and filter live in new files; `Foods.svelte` loses the
  chip row, `pinnedSources` and the "All"/single-source branches for the Foods tab but keeps Meals/Recipes
  code paths untouched. Expect a manual merge of this area on upstream syncs.
- [Users relying on single-source browsing, e.g. "show me USDA only"] → the filter panel can exclude all
  other sources; the result is the same list with one source.
- [Own catalog no longer browsable on the Foods tab] → accepted by the owner until the "My foods" task;
  own foods remain reachable by search, and Meals/Recipes are unchanged.
- [Auto tier 2 on zero results hits USDA's rate limit on typos] → debounce stays at 400 ms and tier 2 runs
  once per query.
- [Live OFF and mirror return the same products] → barcode dedupe (Decision 3).

## Migration Plan

Client-only. Deploy per the usual image update; rollback = previous image. Settings: removed key is
ignored, new key has a safe default; no data migration.

## Open Questions

- Exact wording of the hint and button in other languages — English keys are added; other locales fall back
  to English until translated (Russian is translated in this change; the app has no Ukrainian locale).
