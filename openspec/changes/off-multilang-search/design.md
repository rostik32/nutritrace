# Design

## Context

- Remote search: the client builds a search-a-licious URL in `src/lib/api.js` (`_offSearchUrl`, `langs=` from
  `_getOffSearchLanguage()`, which keeps only the first two characters) and fetches it through
  `/api/proxy`. The proxy first asks the local mirror (`server/lib/off-local.js` `searchByName`) when
  `OFF_LOCAL_DB` is set and falls back to remote OFF on zero hits.
- search-a-licious accepts a comma-separated `langs`; unknown/unindexed codes (`uk`, `cs`) are ignored
  without error. English in the list also matches names stored in a product's main language.
- Names: client `offProductName(p, lang)` in `src/lib/off-name.js` (one language, with a rule that English is
  never placed before `product_name` so default users keep today's names). Mirror rows are converted by
  `_toOffProduct`, which calls `_extractLocalized(list, 'en')` — the language is hard-coded.
- The setting `offSearchLanguage` is a synced user setting (string), also read by the Android app.

## Goals / Non-Goals

**Goals:** backward-compatible storage; one code path for "language order" used by URL building and both
naming paths; mirror naming driven by the same request.

**Non-Goals:** changing ranking/relevance; new remote endpoints; barcode lookup naming.

## Decisions

1. **Keep the setting key, store a comma-separated list** (`"uk,ru,cs"`). Older clients slice the first two
   characters and get the primary language, so the Android build from upstream keeps working. Rejected: a new
   key `offSearchLanguages` — needs a migration, a second synced value and dual writes.
2. **Shared parser** `parseOffLanguages(value) → string[]` (lower-case, two-letter codes, de-duplicated,
   order kept, default `['en']`) in a small module used by `api.js`, `off-name.js` and the settings screen.
3. **Remote `langs` = user list + `en` if absent.** Measured gains for Cyrillic queries; harmless otherwise.
4. **Naming ladder generalised to a list:** the chosen languages first (in order), then `product_name`,
   then the remaining ladder as today. English alone is the default and is not treated as a choice (so
   `['en']` is exactly the current ladder); English inside a longer list was picked on purpose and counts.
5. **Mirror naming from the request:** the proxy passes the request's `langs` to `searchByName`, which passes
   them to `_toOffProduct` → `_extractLocalized` tries each in order, then `main`, then any. Keeps the mirror
   stateless (no settings lookup on the server).
6. **UI:** existing select stays as "Primary language"; below it, checkboxes "Also search in" for the other
   languages. Saving writes `primary,additional…`.

## Risks / Trade-offs

- [Longer `langs` lists may change result ranking for English users] → English-only default produces the
  same request as before (spec scenario "Default user").
- [Fork drift] → change is upstream-friendly; offer it as a PR against `upstream/dev` after it ships here.
- [Mirror scan cost] → unchanged by this change; LIKE over all names already happens today.

## Migration Plan

No data migration. Deploy the new image; existing values parse as one-element lists. Rollback = previous
image; a stored list is still read as its primary language by the old code.
