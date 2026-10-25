# Tasks

## 1. Entry points

- [x] 1.1 Enable long-press on OFF / USDA rows in the unified list with actions "Edit and add" (pick mode) / "Edit" and "Save to My Foods" (design D1), all strings in `src/i18n/en.json` (+ Russian); verify `npm run i18n:check` and, in the local build, that the menu opens on long-press and right-click
- [x] 1.2 Add an "Edit" button to the quantity sheet that opens the editor with the sheet's portion/unit carried into the prefill; verify in the local build that saving logs the edited copy with the typed amount and returns to the diary

## 2. Saving copies

- [x] 2.1 "Save to My Foods" resolves the full product first and opens the editor when it still has no values (D2); verify with an OFF hit that shows "no values listed" (copy saved with full values) and with a product without values (editor opens, nothing saved)
- [x] 2.2 Editor title and note for database prefills (D3); verify the wording in the editor opened from an OFF row, and that an own food still shows the normal edit title and updates in place

## 3. Integration

- [x] 3.1 Walk the spec scenarios in a local production build (phone viewport): edit-and-add, edit outside the diary, cancel, copy replaces the original in the next search; run `npm test`, `npm run i18n:check`, `npm run build` and verify all pass

## Verification notes

Walked in a local production build (phone viewport, public OFF, USDA DEMO_KEY), 2026-10-25:
- "Edit and add" from long-press: copy saved with the changed protein, logged in the meal with it, back in the diary.
- Quantity sheet "Edit nutrition" (OFF 30 g): copy keeps per-100 g values; diary entry is 30 g, 162 kcal, protein 1.8 g.
- Cancel in pick mode, then "Edit" outside the diary: nothing saved on cancel; the later edit saved a copy and the diary
  stayed unchanged (the pick-mode diary context used to survive a cancelled editor and is now cleared).
- "Save to My Foods": a product with values is saved at once with full values; one without values in the full OFF record
  opens the editor ("no nutrition values" notice), nothing saved.
- Own food "Edit" updates in place (title "Edit Food", no new food). Copies replace the OFF row with the same barcode.
- USDA row: editor note names USDA.
- Not reproduced: a search hit without values whose full record has them (no such product found); that path is the
  shared `_completeOffValues` lookup already used by ticked picks.

## Workflow follow-up

- Implement after `foods-unified-search` is merged; open a PR into `diaitika`, deploy per the runbook.
- Offer the generic part upstream as a separate PR against `TraceApps/nutritrace:dev`.
- Archive the change after merge (`/opsx:archive`).
