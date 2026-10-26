# Proposal

## Why

Adding a food to a meal means searching for it again, even for what the user eats at that meal every day. The picker has no per-meal history: the only per-meal list is "Yesterday's Meals" on the Meals tab, and it covers one day. FatSecret-style history lets the user log a usual meal in a few taps.

## What Changes

- The Foods tab of the add-to-meal picker gets four tabs: **Search** (unchanged), **Recently Eaten** (opens by default when there is history), **Most Eaten**, and **Saved**.
- Recently Eaten and Most Eaten each show two blocks: products for the current meal, and products for all meals. Each block shows 5 products and a "Show more" button that adds 20 per click. A product may appear in both blocks, but never twice in one block.
- History covers the last 90 days and is computed on the device from the diary. No per-meal counters are stored.
- Saved lists the user's favorite foods. It is global, not per meal, and sorted by last use.
- On Recently Eaten, Most Eaten and Saved, a tap opens the product card, where the quantity is set. Saving the card ticks the product instead of adding it. A bulk "Add N" action adds all ticked products to the current meal. On Search, a tap works as it does today.
- The Recently Used and Most Used sort options are removed from the picker. They stay on the Foods catalog page.
- Yesterday's Meals stays on the Meals tab. Search history is not added.

## Capabilities

### New Capabilities
- `food-picker`: the tabs and lists of the add-to-meal food picker, the 90-day per-meal and all-meals history, Saved, and ticking several products to add them at once.

### Modified Capabilities
- `food-search`: the empty-search hint applies to the picker's Search tab, and the picker opens on Recently Eaten when history exists.

## Upstream and Scope

- **Generic or diaitika-only:** the picker UX is generic and could go upstream later.
- **Upstream PR:** no, for now. The owner decides after the change lands. The change rewrites part of the large upstream file `src/routes/Foods.svelte`, which makes an upstream merge harder.
- **Out of scope:**
  - search history;
  - per-meal counters, new server endpoints, new database columns;
  - the Meals and Recipes tabs, including Yesterday's Meals and Saved Meals;
  - sorting and layout of the Foods catalog page;
  - history from shared foods and external sources other than the user's own diary entries.

## Impact

- `src/routes/Foods.svelte`: pick-mode tabs, lists, ticking and bulk add.
- `src/lib/food-history.js` (new): pure computation of the history lists, with tests in `scripts/`.
- Diary reads in the web offline mirror (`src/lib/offline-api.js`) and in the Android local database (`src/lib/db-native.js`). Read only.
- `src/i18n/en.json`: new keys.
- No server changes and no database migrations.
