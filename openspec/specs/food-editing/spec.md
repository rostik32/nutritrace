# food-editing Specification

## Purpose
Lets users correct the energy, macros and other nutrients of any food they find, keeping the corrected
version as their own food so it is used from then on.

## Requirements

### Requirement: Edit a database product while adding to a meal
While adding to a meal, the user SHALL be able to open any database search result (Open Food Facts, USDA)
in the food editor. Saving SHALL store the edited product in My Foods and add it to that meal.

#### Scenario: Edit and add from the long-press menu
- **WHEN** the user adds to Breakfast, long-presses an OFF result, chooses "Edit and add", changes protein and saves
- **THEN** a new food with the changed protein is in My Foods and is logged in Breakfast with it

#### Scenario: Edit from the quantity sheet
- **WHEN** the user taps a USDA result, the quantity sheet opens, and the user chooses "Edit"
- **THEN** the food editor opens with that product's values; saving stores the edited copy and returns to the
  quantity sheet with the amount kept and the macros recalculated, and nothing is logged until the sheet is confirmed

#### Scenario: Cancel
- **WHEN** the user opens the editor for a database result and leaves without saving
- **THEN** nothing is added to My Foods or to the meal

### Requirement: Edit a database product from the Foods tab
Outside the add-to-meal flow, editing a database result SHALL save the edited product to My Foods and SHALL
NOT add anything to the diary.

#### Scenario: Edit from the long-press menu
- **WHEN** the user long-presses an OFF result on the Foods tab and chooses "Edit", changes energy and saves
- **THEN** the edited food is in My Foods and the diary is unchanged

#### Scenario: Save without editing
- **WHEN** the user long-presses an OFF result and chooses "Save to My Foods"
- **THEN** the product is added to My Foods with its full values

### Requirement: Copies start from complete values
When a database result lacks values that the full product record has, the editor and "Save to My Foods"
SHALL use the full record. A product that has no values at all SHALL open in the editor with empty fields
for the user to fill, not be saved as zero.

#### Scenario: Search result without values
- **WHEN** an OFF search result shows "no values listed" but the full OFF record has them
- **THEN** the editor opens with the full record's values

#### Scenario: Product without any values
- **WHEN** neither the search result nor the full record has values and the user chooses "Save to My Foods"
- **THEN** the editor opens so the user can enter them, instead of saving a 0 kcal food

### Requirement: The copy is found instead of the original
An edited copy SHALL keep the original barcode, and searches SHALL list the user's copy instead of the
database product with the same barcode.

#### Scenario: Searching again
- **WHEN** the user edited OFF product 4820000000000 and searches its name again
- **THEN** the list shows the user's copy and not the OFF row with that barcode

### Requirement: Own foods are edited in place
Editing a food that already belongs to the user SHALL change that food and SHALL NOT create a copy.

#### Scenario: Editing an own food from results
- **WHEN** the user long-presses an own food in search results, chooses "Edit" and saves
- **THEN** the same food is updated and no new food is created
