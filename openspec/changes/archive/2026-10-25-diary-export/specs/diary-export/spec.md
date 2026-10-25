# Spec Delta

## Purpose

Lets users download the foods they logged for a chosen period as a spreadsheet file, from the diary.

## ADDED Requirements

### Requirement: Export entry point in the diary
The diary SHALL show an "Export" button at the bottom of its main column, after Day Notes. The button
SHALL be shown whether or not day notes are enabled, and SHALL open the export sheet.

#### Scenario: Notes hidden
- **WHEN** the user has turned day notes off and scrolls to the bottom of the diary
- **THEN** the "Export" button is shown and opens the export sheet

### Requirement: Choose the period
The export sheet SHALL offer the presets Today, Yesterday, Week, Month and Select Period, and SHALL show
the resulting dates. Week SHALL cover the last 7 days and Month the last 30 days, both including today.
Select Period SHALL show From and To date fields; a To date before From SHALL disable the export.

#### Scenario: Week preset
- **WHEN** today is 2026-10-25 and the user picks Week
- **THEN** the sheet shows 19 Oct – 25 Oct and the export covers 2026-10-19 to 2026-10-25

#### Scenario: Month preset
- **WHEN** today is 2026-10-25 and the user picks Month
- **THEN** the export covers 2026-09-26 to 2026-10-25

#### Scenario: Invalid custom period
- **WHEN** the user picks Select Period with From 2026-10-20 and To 2026-10-10
- **THEN** "Export CSV" is disabled

### Requirement: The file is a CSV table
The sheet SHALL make clear that the file is CSV: the action reads "Export CSV", a hint names CSV and
spreadsheet apps, and the file name ends in `.csv` and contains the period.

#### Scenario: File name
- **WHEN** the user exports 2026-10-19 to 2026-10-25
- **THEN** the file is named `nutritrace-diary-2026-10-19_2026-10-25.csv`

### Requirement: CSV rows and columns
The CSV SHALL have one row per logged food, ordered by date and meal, with columns Date, Meal (the user's
meal name), Food, Brand, Amount (portion × quantity, as the diary shows it), Unit and then nutrient
columns with units in their headers. Nutrient values SHALL include the logged quantity. Nutrient columns
SHALL be the nutrients the diary shows plus custom nutrients, leaving out columns empty for the period.

#### Scenario: Quantity applied
- **WHEN** the diary has 1.5 × 100 g of a food with 165 kcal per serving in Lunch
- **THEN** its row has Meal "Lunch", Amount 150, Unit g and 247.5 in the calories column

#### Scenario: Show all nutrients off
- **WHEN** "show all nutrients" is off and a logged food has caffeine
- **THEN** the file has no caffeine column

### Requirement: CSV encoding
The file SHALL start with a UTF-8 BOM, SHALL quote fields containing commas, quotes or line breaks, and
SHALL write a missing value as an empty cell, not 0.

#### Scenario: Name with a quote and comma
- **WHEN** a logged food is named `Cheese "Gouda", sliced`
- **THEN** the row stays one row with that name in the Food column

### Requirement: Empty period
When the chosen period has no logged foods, the export SHALL NOT produce a file and SHALL tell the user
there is nothing to export.

#### Scenario: Nothing logged yesterday
- **WHEN** the user picks Yesterday and nothing was logged that day
- **THEN** no file is saved and a message says there are no entries for that period

### Requirement: Works without a server
The export SHALL be built on the device from the app's diary data, so it works in local-only mode and
offline, and on Android SHALL save the file to Downloads.

#### Scenario: Offline
- **WHEN** the device is offline and the user exports Week
- **THEN** the CSV is produced from the locally available diary
