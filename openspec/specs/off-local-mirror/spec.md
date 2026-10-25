# off-local-mirror Specification

## Purpose
Lets a self-hosted server answer Open Food Facts name searches and barcode lookups from a local copy of the
OFF database quickly enough for everyday food logging, without depending on the public OFF API.

## Requirements

### Requirement: Fast name search on the mirror
When the mirror is a Parquet snapshot and its search database is ready, a name search through the server
SHALL return its first page within 1 second on the reference server (Oracle A1, 4 OCPU, 24 GB, stock
4.7 M-product snapshot).

#### Scenario: Ukrainian query
- **WHEN** the search database is ready and the user searches "картопля"
- **THEN** the proxy answers within 1 second with the same products as a search without the database

#### Scenario: Very common word
- **WHEN** the search database is ready and the user searches "milk"
- **THEN** the proxy answers within 1 second and the reported total is the full match count

### Requirement: Fast barcode lookup on the mirror
When the search database is ready, a barcode lookup answered by the mirror SHALL complete within 1 second on
the reference server, including the 12-digit UPC-A to 13-digit EAN-13 retry.

#### Scenario: Known barcode
- **WHEN** the search database is ready and the app looks up a barcode present in the snapshot
- **THEN** the product is returned within 1 second with the same fields as without the database

#### Scenario: UPC-A scan
- **WHEN** the app looks up a 12-digit code whose product is stored under the 13-digit form with a leading zero
- **THEN** the product is found, as it is without the database

### Requirement: Same results as the unindexed search
Using the search database SHALL NOT change which products match, the reported total, their order, the
response shape, or how each result is named, compared with the search on the snapshot file itself.

#### Scenario: Multi-word query in any order
- **WHEN** the user searches "dunkin croissant"
- **THEN** products whose names, brands or barcode contain both words match, as before

#### Scenario: Accent-folded retry
- **WHEN** a query typed without accents matches nothing exactly, e.g. "creme fraiche"
- **THEN** the search retries with accents folded and returns the accented products, as before

#### Scenario: Ranking
- **WHEN** several products match
- **THEN** products with a name starting with the query come first, then by OFF popularity, then by barcode

#### Scenario: Paging
- **WHEN** the client requests page 2 of a search
- **THEN** it receives the next products in the same order with no duplicates or gaps across pages

### Requirement: Search database follows the mirror
The server SHALL build the search database in the background when it is missing or was built from a
different mirror file, and after every successful mirror refresh, without blocking startup or requests.

#### Scenario: First start with a mirror
- **WHEN** the server starts with a mirror file and no search database
- **THEN** it starts serving immediately and builds the database in the background

#### Scenario: Mirror refreshed
- **WHEN** a scheduled or manual mirror refresh completes
- **THEN** a new search database is built from the new file and replaces the old one only once it is complete and valid

#### Scenario: Interrupted build
- **WHEN** a build fails or the server stops during a build
- **THEN** the previously working database (if any) keeps answering and an incomplete file is never used

### Requirement: Fallback without the search database
When the search database is missing, still being built for the first time, invalid, or disabled with
`OFF_LOCAL_INDEX=off`, name search and barcode lookup SHALL behave exactly as they do on the snapshot file
alone, including the remote fallback and air-gap rules.

#### Scenario: Disabled by configuration
- **WHEN** `OFF_LOCAL_INDEX=off` is set
- **THEN** no search database is built or read and searches run on the snapshot file as before

#### Scenario: Stale database during rebuild
- **WHEN** the mirror was refreshed and the new database is still being built
- **THEN** searches keep using the previous database until the new one replaces it

### Requirement: Search database status
The mirror status endpoint (`GET /api/off-local/status`) SHALL report whether the search database is
ready, being built, failed, or disabled, and when it was last built. Existing status fields SHALL stay
unchanged.

#### Scenario: Build in progress
- **WHEN** the status endpoint is called while the database is being built
- **THEN** it reports that the search database is being built, alongside the existing mirror fields
