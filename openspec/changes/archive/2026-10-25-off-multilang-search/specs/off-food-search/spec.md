# Spec Delta

## Purpose

Lets users find Open Food Facts products by name in the languages they actually shop in, and shows each
result under a name they can read.

## ADDED Requirements

### Requirement: Ordered list of search languages
The user SHALL be able to choose one primary OFF search language and any number of additional languages.
The stored preference SHALL remain readable by app versions that understand only a single language.

#### Scenario: Existing single-language setting
- **WHEN** a user upgraded with the search language set to Russian and changes nothing
- **THEN** search and naming behave as Russian-primary with no additional languages

#### Scenario: Adding languages
- **WHEN** the user keeps Ukrainian as primary and adds Russian and Czech
- **THEN** the preference is stored as Ukrainian, Russian, Czech in that order

#### Scenario: Older client reads a list
- **WHEN** an app version that supports one language reads a stored list starting with Ukrainian
- **THEN** it treats the preference as Ukrainian

### Requirement: Remote search covers every chosen language
A remote name search SHALL request results for all chosen languages in one query and SHALL include English
even when the user did not choose it.

#### Scenario: Several languages chosen
- **WHEN** the user's languages are Ukrainian, Russian and searches "сметана"
- **THEN** the search request asks OFF for Ukrainian, Russian and English results together

#### Scenario: Default user
- **WHEN** the preference is the default (English only)
- **THEN** the request is the same as before this change

### Requirement: Result name follows the language order
A result's displayed name SHALL be the first non-blank name in the user's language order, then the
product's main-language name, then any other available name. A user on the default English preference
SHALL see the same names as before this change.

#### Scenario: Product with Ukrainian and English names
- **WHEN** the user's languages are Ukrainian, Russian and a product has English and Ukrainian names
- **THEN** the Ukrainian name is shown

#### Scenario: First language missing
- **WHEN** the user's languages are Ukrainian, Russian and a product only has Russian and Czech names
- **THEN** the Russian name is shown

#### Scenario: Default user unchanged
- **WHEN** the preference is English only
- **THEN** the shown name is identical to the name shown before this change

### Requirement: Local mirror results use the same naming
When the local OFF mirror answers a name search, its results SHALL be named with the same language order
as remote results, and the mirror SHALL match the query against product names in every language.

#### Scenario: Ukrainian query on the mirror
- **WHEN** the mirror is enabled and the user searches "картопля"
- **THEN** products whose Ukrainian name contains "картопля" are returned, named in the user's language order

### Requirement: Ukrainian and Czech options
The language choices SHALL include Ukrainian and Czech, and the country filter SHALL include Ukraine and
Czech Republic, mapped to the OFF country tags `en:ukraine` and `en:czech-republic`.

#### Scenario: Country filter Ukraine
- **WHEN** the user sets the search country to Ukraine and searches
- **THEN** remote results are restricted to products tagged `en:ukraine`
