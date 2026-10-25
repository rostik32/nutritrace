# Design

## Context

What already exists (checked 2026-10-25):
- `FoodEditor.svelte` takes `editorState.foodPrefill`; when the prefill has no numeric `id` and has a
  barcode it looks up the full OFF record if the search hit lacks values (`needsFullLookup`). `save()`
  creates a food when there is no `id`, and when `editorState.foodDiaryCtx` is set it also adds the saved
  food to that meal (`addDiaryItem`, portion from the editor) and returns to the diary (`history.go(-2)`).
- `Foods.svelte` → `openEditor(item, store)` sets the prefill and, in pick mode, the diary context. It is
  already used for OFF results without "as sold" values (#241).
- Outside pick mode, tapping a database row opens `FoodDetailSheet`, whose Edit button opens the editor;
  saving creates the copy. This path stays.
- The long-press action sheet offers "Save to My Foods" for rows without `id`, but long-press is disabled on
  database rows in the "All" list; "Save to My Foods" posts the search hit as is (partial values possible).
- The quantity sheet (`showQtyPrompt`) opens on tap in pick mode when `diaryPromptQuantity` is on; when it
  is off, a tap adds immediately.

## Goals / Non-Goals

**Goals:** reuse the editor's existing create + add-to-diary path; no new routes or server calls.

**Non-Goals:** a new inline nutrition editor inside the quantity sheet; editing diary entries.

## Decisions

### 1. Entry points
- Long-press on a database row (OFF, USDA) in the unified list opens the action sheet with:
  pick mode → "Edit and add", "Save to My Foods"; otherwise → "Edit", "Save to My Foods".
- Quantity sheet → a secondary "Edit" button that closes the sheet and calls
  `openEditor(promptFood, 'foodList')` (diary context set by pick mode). Shown for database and own foods;
  for own foods it edits the food itself (existing behaviour of the editor with an `id`).
- When `diaryPromptQuantity` is off, long-press is the entry point (no sheet to host the button).
Alternative: an always-visible pencil icon on every row — rejected, it crowds rows on phones and makes the
primary tap target smaller.

### 2. Complete values before saving a copy
"Save to My Foods" for a database row runs the same resolution as ticked picks (`_resolveOffPicks`): look up
the full product when needed; if values exist, `createFood` with the full record; if the product still has
no values, open the editor instead of saving 0 kcal. The editor path already does its own lookup.

### 3. Editor wording for copies
When the prefill is a database product (no numeric `id`, source OFF/USDA), the editor title reads "Edit and
save to My Foods" and a one-line note says the original database entry is not changed. Save button text is
unchanged ("Save", or "Save and add" with a diary context if that string exists; otherwise unchanged).

### 4. Replacing the original in results
Relies on `foods-unified-search` D3 (own barcodes hide database rows with the same barcode). The copy keeps
`barcode` from the prefill; nothing extra here. USDA rows without barcode are not hidden (the copy appears
first among own matches anyway).

## Risks / Trade-offs

- [Duplicate copies when the user edits the same product twice] → the editor already warns about a duplicate
  barcode in My Foods (`_myFoods` check); keep that warning.
- [Long-press is not discoverable] → the quantity sheet "Edit" covers the common path; long-press is the
  secondary path.
- [Editor adds with its own portion, not the quantity typed in the sheet] → when opened from the quantity
  sheet, pass the typed portion/unit as the prefill portion so the logged amount matches.

## Migration Plan

Client-only, ships with or after `foods-unified-search`; rollback = previous image.
