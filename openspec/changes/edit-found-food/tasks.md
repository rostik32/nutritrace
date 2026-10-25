# Tasks

## 1. Entry points

- [ ] 1.1 Enable long-press on OFF / USDA rows in the unified list with actions "Edit and add" (pick mode) / "Edit" and "Save to My Foods" (design D1), all strings in `src/i18n/en.json` (+ Russian); verify `npm run i18n:check` and, in the local build, that the menu opens on long-press and right-click
- [ ] 1.2 Add an "Edit" button to the quantity sheet that opens the editor with the sheet's portion/unit carried into the prefill; verify in the local build that saving logs the edited copy with the typed amount and returns to the diary

## 2. Saving copies

- [ ] 2.1 "Save to My Foods" resolves the full product first and opens the editor when it still has no values (D2); verify with an OFF hit that shows "no values listed" (copy saved with full values) and with a product without values (editor opens, nothing saved)
- [ ] 2.2 Editor title and note for database prefills (D3); verify the wording in the editor opened from an OFF row, and that an own food still shows the normal edit title and updates in place

## 3. Integration

- [ ] 3.1 Walk the spec scenarios in a local production build (phone viewport): edit-and-add, edit outside the diary, cancel, copy replaces the original in the next search; run `npm test`, `npm run i18n:check`, `npm run build` and verify all pass

## Workflow follow-up

- Implement after `foods-unified-search` is merged; open a PR into `diaitika`, deploy per the runbook.
- Offer the generic part upstream as a separate PR against `TraceApps/nutritrace:dev`.
- Archive the change after merge (`/opsx:archive`).
