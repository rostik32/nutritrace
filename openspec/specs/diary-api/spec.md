# diary-api Specification

## Purpose
Lets scripts read the diary for a date range through the public REST API and use each item without
re-implementing meal names or nutrition maths.

## Requirements

### Requirement: Diary items for a date range
`GET /api/v1/diary?start=&end=` SHALL return `{start, end, entries: [{date, items, count}], count}` for
every logged day in the inclusive range, oldest first, with the same rules as the MCP tool
`list_diary_entries_range`: both bounds omitted means the last 90 days, one bound leaves the other side
open, invalid dates or start after end return 400, and more than 366 logged days returns 400. It SHALL
require the `mcp:read` scope and `PUBLIC_API_ENABLED`.

#### Scenario: One week
- **WHEN** a script calls `GET /api/v1/diary?start=2026-10-19&end=2026-10-25` with an `mcp:read` token
- **THEN** it receives the logged days in that range, each with its items

#### Scenario: Bad range
- **WHEN** a script calls `GET /api/v1/diary?start=2026-10-25&end=2026-10-19`
- **THEN** the response is 400 with an error message

### Requirement: Daily totals for a date range
`GET /api/v1/diary/totals?start=&end=` SHALL return `{start, end, totals: [{date, totals, water_ml,
item_count}], count}` with the same range rules as `get_daily_totals_range` (no logged-day limit).

#### Scenario: Month of totals
- **WHEN** a script calls `GET /api/v1/diary/totals?start=2026-10-01&end=2026-10-31`
- **THEN** it receives one totals row per logged day in October

### Requirement: Meal name and quantity-applied nutrition on items
Every diary item returned by the diary reads (REST `/api/v1/diary/:date` and the range route, MCP
`list_diary_entries` and `list_diary_entries_range`) SHALL include `meal_name`, the user's name for the
item's meal (falling back to `Meal N`), and `totals`, the item's nutrition with quantity applied and split
recipes summed. Existing item fields SHALL be returned unchanged.

#### Scenario: Item with quantity
- **WHEN** Lunch holds 1.5 servings of a food with `nutrition.calories` 165 and the user's meal names are the defaults
- **THEN** the item has `meal: 1`, `meal_name: "Lunch"`, `nutrition.calories: 165` and `totals.calories: 247.5`

#### Scenario: Renamed meals
- **WHEN** the user renamed meal 3 to "Перекус"
- **THEN** items in that meal have `meal_name: "Перекус"`
