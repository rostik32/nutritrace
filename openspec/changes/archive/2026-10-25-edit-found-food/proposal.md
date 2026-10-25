# Proposal

## Why

Database entries are often slightly wrong or missing values (OFF products with no "as sold" values, a
different recipe in the local shop, USDA rows per 100 g when the pack says per piece). Today the user can
fix such a product only from the Foods tab outside the diary (detail sheet → Edit). While adding to a meal,
tapping a database result adds it as is, and the long-press menu of database rows is disabled, so the
user logs wrong numbers or leaves the flow. The owner wants every found product to be editable — energy,
macros and other nutrients — right where it was found.

## What Changes

- **Edit from the add-to-meal flow.** A database result (OFF, USDA) can be opened in the food editor from
  the add-to-meal flow: from its long-press menu ("Edit and add") and from an "Edit" action in the
  quantity sheet. Saving stores a corrected copy in My Foods and adds it to the meal being filled.
- **Long-press on database rows** offers "Edit" (outside the diary flow: saves a copy, adds nothing) and
  "Save to My Foods", and is no longer disabled.
- **Complete values first.** Before editing or saving a copy, the full product is looked up when the
  search result lacks values (same lookup the editor and quick-add already use), so the copy is not saved
  with the search index's partial numbers.
- **The copy replaces the original in results.** Because the copy keeps the barcode, the search shows the
  user's copy instead of the database row (dedupe from `foods-unified-search`).
- Own foods keep today's behaviour: Edit changes the food itself.

Upstream: yes — editing a database result before logging it is generic and small; offer it as a separate
PR re-applied to upstream's single-source and "All" lists (here it is built on the unified list).

Out of scope: editing shared foods (still "Save to my catalog" first), editing Mealie / CookTrace imports
(they already open an editor), contributing corrections back to Open Food Facts, changing a diary entry's
nutrition without saving a copy, bulk editing.

Depends on: `foods-unified-search` (single result list and barcode dedupe). Implement after it is merged.

## Capabilities

### New Capabilities
- `food-editing`: editing the nutrition of foods the user finds — saving corrected copies of database
  products to My Foods, from the Foods tab and from the add-to-meal flow.

### Modified Capabilities
<!-- none -->

## Impact

- Client: `src/routes/Foods.svelte` (long-press menu for database rows, "Edit" in the quantity sheet,
  editor context), `src/routes/FoodEditor.svelte` (title/hint when the prefill is a database product;
  existing save + add-to-diary path reused), `src/i18n/*.json`.
- Server: none (`POST /api/foods` as today).
- Tests: a unit test for the "which action does a row offer" helper if extracted; manual verification in
  the local build.
