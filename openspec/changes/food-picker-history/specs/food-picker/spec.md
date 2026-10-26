# Spec Delta

## Purpose

Lets the user add foods to a meal quickly from their own history per meal and from favorites, and add several products in one step, without searching each time.

## ADDED Requirements

### Requirement: Picker tabs
The Foods tab of the add-to-meal picker SHALL show four tabs in this order: Search, Recently Eaten, Most Eaten and Saved. When the picker opens, Recently Eaten SHALL be active if the user has history in the last 90 days, otherwise Search SHALL be active.

#### Scenario: Opening the picker with history
- **WHEN** the user opens the picker to add to Breakfast and has logged foods in the last 90 days
- **THEN** the Recently Eaten tab is active

#### Scenario: Opening the picker without history
- **WHEN** the user opens the picker to add to Breakfast and has no logged foods in the last 90 days
- **THEN** the Search tab is active

### Requirement: Two blocks on history tabs
Recently Eaten and Most Eaten SHALL each show two blocks: one for the current meal and one for all meals. Each block SHALL show five products at first, and a "Show more" button SHALL add twenty more products per click. A block SHALL NOT list the same product twice. A product MAY appear in both blocks.

#### Scenario: Showing more products
- **WHEN** the current meal has 30 products in its history and the user opens Most Eaten
- **THEN** five products are listed, and each click on "Show more" adds twenty more until the list ends

#### Scenario: Same product in both blocks
- **WHEN** the user logged "Boiled Egg" for Breakfast and for Lunch in the last 90 days
- **THEN** "Boiled Egg" is listed in the Breakfast block and in the all-meals block

### Requirement: History window and order
History SHALL use the diary entries logged in the last 90 days, counting today. Recently Eaten SHALL order products by their latest log date, most recent first. Most Eaten SHALL order products by the number of times they were logged in the window, most first, with ties ordered by the latest log date.

#### Scenario: Entry older than 90 days
- **WHEN** a product was last logged 91 days ago
- **THEN** it is not listed on Recently Eaten or Most Eaten

#### Scenario: Most eaten order
- **WHEN** "Oat milk" was logged 6 times and "Eggs" 4 times in the window
- **THEN** "Oat milk" is listed before "Eggs" on Most Eaten

### Requirement: Product identity in history
Diary entries SHALL be grouped as one product by this order of keys: the catalog food id when the entry has one; otherwise the normalized barcode; otherwise the source and its external id; otherwise the normalized name. The name, brand and image shown for a product SHALL come from its latest entry.

#### Scenario: Same catalog food
- **WHEN** a catalog food was logged on Monday and on Wednesday under a different name
- **THEN** it is one product, shown with the name from Wednesday

#### Scenario: Same barcode from an external database
- **WHEN** two entries without a catalog id have the same barcode
- **THEN** they are one product

### Requirement: Saved tab
The Saved tab SHALL list the user's favorite foods, not meals. The list is the same for every meal and SHALL be ordered by last use, most recent first, with ties ordered by name.

#### Scenario: Favorite food
- **WHEN** the user marks "Tuna fillet" as a favorite and opens Saved
- **THEN** "Tuna fillet" is listed, and it is listed at the top if it was used most recently

#### Scenario: Meal not listed
- **WHEN** the user has a favorite meal
- **THEN** the favorite meal is not listed on Saved

### Requirement: Ticking products
On Recently Eaten, Most Eaten and Saved, tapping a product SHALL open its product card, where the quantity is set. Saving the card SHALL mark the product as ticked and SHALL NOT add it to the diary. A bulk action "Add N" SHALL add every ticked product to the current meal with its quantity and clear the ticks.

#### Scenario: Ticking a product
- **WHEN** the user taps "Boiled Egg", sets 2 pieces and saves the card
- **THEN** "Boiled Egg" is ticked and the diary is unchanged

#### Scenario: Bulk add
- **WHEN** the user ticks three products on different tabs and taps "Add 3"
- **THEN** the three products are added to the current meal with their quantities, and the ticks are cleared

### Requirement: Default quantity for ticked products
A product's quantity in the product card SHALL default to the quantity of its latest entry in the current meal. In the all-meals block it SHALL default to the quantity of its latest entry in any meal. Without history it SHALL default to the catalog portion.

#### Scenario: Quantity from the last time in this meal
- **WHEN** the user last logged 150 g of "Rice" at Lunch and opens its card from Lunch history
- **THEN** the card shows 150 g

### Requirement: Search tab is unchanged
The Search tab SHALL NOT show ticks. Tapping a result on the Search tab SHALL add it to the diary as before.

#### Scenario: Tapping a search result
- **WHEN** the user taps a result on the Search tab
- **THEN** the product is added to the current meal, and no tick is shown

### Requirement: Works offline from the device diary
The history tabs SHALL be computed from the diary stored on the device, so they work without a connection. When the device is online, the days of the last 90 days that are not stored on the device SHALL be fetched before the history is shown.

#### Scenario: Offline
- **WHEN** the user opens Recently Eaten without a connection
- **THEN** the list is computed from the stored diary days, with no error

#### Scenario: Online with missing days
- **WHEN** the user opens Recently Eaten online and some of the last 90 days are not stored on the device
- **THEN** those days are fetched first and the list includes them

### Requirement: No sort options on history tabs
The history tabs and Saved SHALL NOT show a sort control. Their order is fixed by this spec.

#### Scenario: Sort control absent
- **WHEN** the user opens the picker on any of the history tabs or Saved
- **THEN** no sort control is shown
