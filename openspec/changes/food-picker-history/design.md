# Design

## Context

See proposal.md for motivation.

- The add-to-meal picker is the Foods page in pick mode (`pickMode` in `src/routes/Foods.svelte`). Its tabs are Foods, Meals and Recipes (`activeTab` 0, 1, 2). The Meals tab already has Yesterday's Meals and Saved Meals.
- In pick mode a tap on a result adds it straight to the meal. The product card (`openEditor` with `diary`) already sets a quantity. Multi-select exists already: `selectedFoods`, `toggleSelect`, `confirmMultiAdd`, and a portion sheet when the quantity-prompt setting is on.
- The diary is one row per date with an `items` JSON array. Each item carries its meal index, its quantity, a nutrition snapshot, and a catalog reference: `food_server_id` on Android, `foodId` or `id` in other code paths.
- Foods have a `favorite` flag and a global `last_used_at` on the server. Both sync to the device.
- Storage on the device differs by platform. The web keeps an IndexedDB mirror (`src/lib/offline-api.js`) that holds only the diary days it has loaded. Android keeps a local SQLite copy (`src/lib/db-native.js`) that already has a date-range query.

## Goals / Non-Goals

**Goals**
- The same history on every device, online or offline, with no per-meal state to keep in sync.
- The history tabs open without a visible wait.

**Non-Goals**
- A server endpoint for history.
- Storing history beyond the 90-day window.
- Changes to the Meals and Recipes tabs.

## Decisions

### 1. Compute history on the device from the diary, in one place
A pure function in `src/lib/food-history.js` takes the diary days in the 90-day window and returns four ordered lists: this meal, and all meals, each ordered by recency and by frequency. It is plain JavaScript without Svelte, tested with `node --test` in `scripts/`.

- Alternative: a server endpoint. Rejected. It needs a network call each time the picker opens, and it would be a second implementation that can disagree with the offline results.
- Alternative: per-meal counters. Rejected. Items change in many places: add, copy, move, clear meal, delete, and sync from the phone. Counters would drift from the diary. The existing global counters already needed a backfill for this reason.

Derived data cannot disagree with the diary it is derived from. The window is at most 90 rows per user, so the computation is cheap.

### 2. Fill the window before showing history
When the device is online, the picker fetches any missing days of the last 90 days first. On the web this uses `getDiaryRange` and writes the days into the IndexedDB mirror. On Android the local copy should already hold the synced days; the implementation checks this and fetches any gap. Offline, the picker uses what is stored.

The web mirror keeps only days it has loaded, so this fill is required for correct results.

### 3. Product identity
Diary entries are grouped by the first key that exists:

1. the catalog food id, when the entry has a positive one;
2. the normalized barcode (leading zeros removed);
3. the source and its external id;
4. the normalized name, as a last resort.

The display name, brand and image come from the latest entry of the group. A phone-only food has no server id until it syncs. The sync already remaps local ids to server ids, and the history is computed after that remap, so the same food is not counted twice.

The barcode helper is separate from `rowKey` in `src/lib/food-search.js`, which checks the barcode first. The order here is catalog id first, as agreed.

### 4. Quantity default
A ticked product's quantity defaults to the quantity of its latest entry in the current meal. In the all-meals block it uses the latest entry in any meal. Without history it uses the catalog portion, times one.

### 5. Selection
The existing `selectedFoods` set is reused. A per-product quantity map is added so each card's quantity is kept until "Add N". Ticks are kept when the user switches between the history tabs during one picker session, and cleared when the picker closes. This differs from today, where switching tabs clears the selection. The reason is the workflow the user described: choose from several tabs, then add once.

### 6. Pagination
The lists are computed once per open and cached, keyed by a version that changes when the diary changes. The UI shows the first five products and adds twenty per "Show more". No server paging is needed.

### 7. Saved
Saved shows foods with `favorite = 1`, not meals, ordered by `last_used_at` and then by name. It is global.

### 8. Search tab and sort
The Search tab is unchanged. The picker's history lists have no sort control. The Foods catalog page keeps its sort options.

## Risks / Trade-offs

- **Incomplete history offline on the web.** A device that never loaded some days shows a shorter list offline. Mitigation: the fill runs whenever the device is online, and an empty list points the user to Search.
- **One product, two keys.** Adding an external product (OFF, USDA) creates a catalog food when it is added, so new entries carry a catalog id. The split can only come from older entries without one, and from an entry saved before its catalog food existed. Mitigation: accepted, because the order was agreed. If users see duplicates, the order can change to barcode first.
- **Changes on another device.** A meal logged on another device appears only after sync.
- **Compute cost.** About 90 days of JSON per open. Mitigation: a test with 90 days of 30 items, with a time limit, guards against regressions.

## Migration Plan

No data migration. No schema change. Rollback is a revert of the picker change; the history lists disappear and the picker falls back to Search.
