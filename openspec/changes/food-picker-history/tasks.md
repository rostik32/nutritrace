# Tasks

## 1. History computation

- [x] 1.1 Add `src/lib/food-history.js` with the product key and the four lists (this meal and all meals, recent and most), over a 90-day window with today included. Verify: unit tests in `scripts/food-history.test.js` cover key order, window edges, no duplicates within a block, duplicates across blocks, and quantity defaults; `npm test` passes on Node 20.
- [x] 1.2 Check the cost of the computation. Verify: a test with 90 days of 30 items per day finishes within a fixed time limit on Node 20, and the test fails when the limit is exceeded.

## 2. Diary window on the device

- [x] 2.1 Web: when online, fetch the missing days of the last 90 days with `getDiaryRange` and write them into the IndexedDB diary mirror before the history is shown. Verify: with the mirror cleared, opening the picker online fills the window; offline, the stored days are used with no error.
- [ ] 2.2 Android: confirm the local SQLite diary holds the synced days of the window and read it with the existing date-range query. Fetch any gap when online. Verify: on a device with a test account, the history matches the server's last 90 days.
- [x] 2.3 Recompute the history each time the picker opens, reading the diary again (no diary version). Verify: an item added to the diary shows in Recently Eaten the next time the picker opens.

## 3. Picker tabs and lists

- [x] 3.1 Add the four tabs (Search, Recently Eaten, Most Eaten, Saved) to the Foods picker in pick mode. Search keeps its current behavior. Recently Eaten is the default when there is history, otherwise Search. Verify: opening the picker from Breakfast with history shows Recently Eaten; with no history it shows Search.
- [x] 3.2 Build the two blocks on Recently Eaten and Most Eaten: this meal, and all meals. Show five products, and "Show more" adds twenty per click. Verify: with 30 products in a block the list shows 5, then 25, then the rest; no product repeats within a block.
- [x] 3.3 Build the Saved tab from favorite foods, ordered by last use and then name, without meals. Verify: marking a food as a favorite adds it to Saved, unmarking removes it, and a favorite meal is not listed.
- [x] 3.4 Remove the Recently Used and Most Used sort options from the picker only. Verify: no sort control in pick mode; the Foods catalog page still shows them.
- [x] 3.5 Keep Yesterday's Meals on the Meals tab exactly as it is. Verify: the Meals tab in pick mode shows it as before.

## 4. Ticking and bulk add

- [x] 4.1 On the history tabs, tapping a product opens its product card; "Save" in the card ticks the product and keeps its quantity, and does not add it to the diary. Verify: tap, set a quantity, save; the row shows a tick and the diary is unchanged.
- [x] 4.2 Use the existing multi-select to add all ticked products to the current meal with their quantities, through the portion sheet when that setting is on, and clear the ticks. Keep ticks across the history tabs during one picker session. Verify: tick three products on different tabs, tap "Add 3"; the diary shows the three items in that meal with their quantities.
- [x] 4.3 Quantity default in the card: the latest entry in the current meal, or in any meal for the all-meals block, or the catalog portion. Verify: a product last logged as 150 g at Lunch opens with 150 g from the Lunch block.
- [x] 4.4 Keep the Search tab as it is: no ticks, and a tap adds the product directly. Verify: tapping a result on Search adds it as before.

## 5. Strings and tests

- [x] 5.1 Add every new user-facing string to `src/i18n/en.json`. Verify: `npm run i18n:check` passes.
- [x] 5.2 Update existing tests that depend on the old default tab or the old sort options in the picker. Verify: `npm test` passes on Node 20.

## 6. Verification

- [x] 6.1 Run the local production build and check the flow: log foods on two days, open the Breakfast picker, check each tab, tick products from different tabs, and add them in one step. Verify: the flow works as described, with a note of any difference.
- [x] 6.2 Confirm no server code changed. Verify: `git diff --stat` shows no changes under `server/`.

## 7. Fixes after the phone test

- [x] 7.1 Replace the shared Tabs bar in the picker with a bar that sizes tabs to their labels and scrolls sideways without a visible scrollbar; a tapped tab scrolls into view. Verified at 375 px: page width 375 = viewport, bar scrollable, Saved fully visible after the tap; at desktop width the tabs fill the bar.
- [x] 7.2 Open the picker on Recently Eaten with a loading state and move to Search only when there is no history and no tab was chosen. Verified: the first frame shows Recently Eaten with "Loading your history…", no Search in between.
- [x] 7.3 Show the energy of each history row for its amount (tick amount once ticked). Verified: "100g × 2 · 310 kcal" for 2 × 100 g of a 155 kcal food; 150 g of a 59 kcal food shows 89 kcal.
- [x] 7.4 Skip the Set Portions sheet when every pick already has a quantity from its tick. Verified with the quantity prompt setting on: two ticks went into the diary at once (150 g and 100 g) with no sheet.

## 8. Saving foods and meal icons

- [x] 8.1 Show the meal's icon in its diary color on the meal block title and a history icon on the all-meals title. Verified: the Breakfast picker shows the orange breakfast cup and a history icon.
- [x] 8.2 Add a heart to the product card that toggles Saved, saving a database product to My Foods first; no heart for shared foods. Verified for a catalog food: the heart fills and Saved lists it at once, tapping again empties Saved. The database-product path was not run in the browser (needs live OFF).
- [x] 8.3 Add "Add to Saved" / "Remove from Saved" to the diary item's long-press menu for items logged from a catalog food. Verified on the web: the action sets the food's favorite (other fields unchanged) and the menu then offers Remove from Saved. Recipes and quick calories are excluded by `catalogFoodFor` (unit tested).
- [x] 8.4 Find a diary item's catalog food with one shared helper (`catalogFoodFor`). Verified: the unit test covers web ids, phone ids, unsent phone items, recipes, quick calories and deleted foods; `npm test` 987/987 on Node 20.

## Workflow follow-up

- Open a pull request into `diaitika` (protected branch; changes only through pull requests).
- Archive the change after the pull request is merged.
