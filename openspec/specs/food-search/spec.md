# food-search Specification

## Purpose
Lets users find a food on the Foods tab by typing its name once, answering from their own and the server's
data first and from slower online databases only when needed, in one list without choosing a source.

## Requirements

### Requirement: Empty search shows a hint
When the search box on the Foods tab is empty, the tab SHALL show a short hint to type a name or scan a
barcode and SHALL NOT list the user's own catalog or any other results.

#### Scenario: Opening the Foods tab
- **WHEN** the user opens the Foods tab with an empty search box
- **THEN** a hint is shown and no food rows are listed

#### Scenario: Clearing the search
- **WHEN** the user has results for "milk" and clears the search box
- **THEN** the results disappear and the hint is shown again

#### Scenario: Adding to a meal
- **WHEN** the user opens the Foods tab from the diary to add to Breakfast with an empty search box
- **THEN** the same hint is shown instead of the own catalog

### Requirement: First search step uses own and server data
A search SHALL first look in the user's own foods, the foods shared with the user, and Open Food Facts as
answered by the server (its local mirror, or live OFF when the mirror has no match or is not configured).

#### Scenario: Match in own foods and in the mirror
- **WHEN** the user has an own food "Milk 2.5%" and searches "milk" on a server with the OFF mirror
- **THEN** the list shows "Milk 2.5%" and the mirror's milk products without querying USDA

#### Scenario: Offline
- **WHEN** the device is offline and the user searches "milk"
- **THEN** only own foods are searched and the list says that online sources need a connection

### Requirement: Online databases only when nothing is found
When the first step finds no results at all, the search SHALL automatically query the online databases
that are enabled (USDA, Mealie, CookTrace pantry) and show their results in the same list.

#### Scenario: Nothing found locally
- **WHEN** the search "quinoa puffs xyz" finds nothing in own foods, shared foods and OFF
- **THEN** USDA (when enabled) is queried automatically and its results are listed

#### Scenario: Something found locally
- **WHEN** the search "milk" finds own or OFF results
- **THEN** USDA, Mealie and CookTrace are not queried until the user asks for it

#### Scenario: Results hidden by a filter
- **WHEN** the first step returns results but the active filters hide all of them
- **THEN** online databases are not queried automatically and the list says the filters hide the results

### Requirement: Search online databases on demand
While the first step has results and at least one online source is available, a "Search online databases"
button SHALL be shown under the search field. Using it SHALL query USDA, Mealie, CookTrace pantry and live
OFF (bypassing the mirror) and append their results to the list.

#### Scenario: User asks for more
- **WHEN** the user searched "milk", got mirror results, and taps "Search online databases"
- **THEN** live OFF and USDA results are appended after the existing results, without products already listed

#### Scenario: No online source available
- **WHEN** USDA, Mealie and CookTrace are disabled and the server forbids live OFF (`OFF_LOCAL_ONLY`)
- **THEN** the button is not shown

#### Scenario: Already searched online
- **WHEN** online databases were already queried for the current search
- **THEN** the button is not shown until the search text changes

### Requirement: One result list
Results from every source SHALL appear in a single list without per-source sections. Own and shared
matches come first, then database results. Each row SHALL show which source it came from. A product
already listed SHALL NOT be listed again when another source returns it.

#### Scenario: Mixed sources
- **WHEN** a search returns two own foods and fifty OFF products
- **THEN** one list shows the two own foods first and the OFF products after them, each row with its source badge

#### Scenario: Same product twice
- **WHEN** the mirror and live OFF both return barcode 4820000000000
- **THEN** the product is listed once

### Requirement: Pagination over the whole list
The result list SHALL load further database results when the user scrolls to about one screen before the
end, with at most one page request in flight, and SHALL stop requesting when every source has returned its
last page.

#### Scenario: Not scrolling
- **WHEN** the first page of results is shown and the user does not scroll
- **THEN** no further page is requested

#### Scenario: Scrolling down
- **WHEN** the user scrolls to about one screen before the end of the list
- **THEN** one next page is requested and appended to the end of the list

#### Scenario: Last page
- **WHEN** every source has returned its last page
- **THEN** no more requests are made and the list ends

### Requirement: Results always match the current search
Results and pages that arrive for an earlier search text SHALL be discarded.

#### Scenario: Typing fast
- **WHEN** the user types "mil", then "milk", and the response for "mil" arrives after the one for "milk"
- **THEN** the list shows only the results for "milk"

### Requirement: Filter panel
A filter button right of the search field SHALL open a panel to choose which sources are included, the
sort order, the OFF completeness and USDA data-type filters, and (when enabled in settings and the user has
categories) a category for own foods. The Foods tab SHALL NOT show source chips.

#### Scenario: Excluding a source
- **WHEN** the user turns off OFF in the filter panel and searches "milk"
- **THEN** no OFF results are listed and OFF is not queried

#### Scenario: Filter indicator
- **WHEN** any filter differs from its default
- **THEN** the filter button shows that filters are active

#### Scenario: Choice remembered
- **WHEN** the user excludes USDA and sets the sort to most used, then reopens the Foods tab later
- **THEN** USDA stays excluded and the sort is still most used

### Requirement: Sort order
The sort options SHALL be relevance (default), alphabetical, recently used and most used. Sort SHALL order
the own and shared matches; database results SHALL keep the order the database returns.

#### Scenario: Relevance
- **WHEN** the sort is relevance and own foods "Milk chocolate", "Oat milk" and "Milk 2.5%" match "milk"
- **THEN** foods whose name starts with "milk" are listed before "Oat milk"

#### Scenario: Most used
- **WHEN** the sort is most used
- **THEN** own matches are ordered by how often they were logged and OFF results stay in OFF's order

### Requirement: Search settings
Settings → Foods SHALL NOT offer a default search source. The Foods sort setting SHALL offer relevance and
SHALL be the default sort of the Foods search. The show-categories setting SHALL control the category filter
in the filter panel.

#### Scenario: Default search source setting
- **WHEN** the user opens Settings → Foods
- **THEN** there is no "Default Search Source" option

#### Scenario: Upgraded user with a saved default source
- **WHEN** a user had "Default Search Source" set to USDA before this change
- **THEN** the Foods tab works as described here and the Meals and Recipes tabs open on My Foods

#### Scenario: Foods sort default
- **WHEN** a user never changed the Foods sort
- **THEN** the Foods search sorts by relevance
