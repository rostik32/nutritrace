# Spec Delta

## MODIFIED Requirements

### Requirement: Empty search shows a hint
When the search box on the Foods tab is empty, the tab SHALL show a short hint to type a name or scan a barcode and SHALL NOT list the user's own catalog or any other results. In the add-to-meal picker this applies to the Search tab only; the history tabs and Saved are governed by the food-picker capability.

#### Scenario: Opening the Foods tab
- **WHEN** the user opens the Foods tab with an empty search box
- **THEN** a hint is shown and no food rows are listed

#### Scenario: Clearing the search
- **WHEN** the user has results for "milk" and clears the search box
- **THEN** the results disappear and the hint is shown again

#### Scenario: Adding to a meal
- **WHEN** the user opens the picker from the diary to add to Breakfast with an empty search box
- **THEN** the picker opens on Recently Eaten if there is history in the last 90 days, otherwise on Search; the Search tab shows the same hint instead of the own catalog

### Requirement: Sort order
The sort options SHALL be relevance (default), alphabetical, recently used and most used on the Foods catalog page and on the Search tab outside the add-to-meal picker. On the Search tab of the add-to-meal picker the sort options SHALL be relevance and alphabetical only, because recently used and most used are the picker's history tabs. Sort SHALL order the own and shared matches; database results SHALL keep the order the database returns.

#### Scenario: Relevance
- **WHEN** the sort is relevance and own foods "Milk chocolate", "Oat milk" and "Milk 2.5%" match "milk"
- **THEN** foods whose name starts with "milk" are listed before "Oat milk"

#### Scenario: Most used
- **WHEN** the sort is most used
- **THEN** own matches are ordered by how often they were logged and OFF results stay in OFF's order

#### Scenario: Picker sort options
- **WHEN** the user opens the filter on the Search tab of the add-to-meal picker
- **THEN** only relevance and alphabetical are offered
