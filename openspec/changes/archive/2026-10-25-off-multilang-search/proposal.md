# Proposal

## Why

Users who shop in several languages (here: Ukrainian, Russian, Czech, English) cannot find most local
products. The app sends exactly one language to Open Food Facts search-a-licious, and the local OFF mirror
always prefers English names. Measured on 2026-10-24: "сметана" returns 84 hits with `langs=en`, 176 with
`ru`, 259 with `en,ru`; Ukrainian "картопля" returns 0–1 from search-a-licious but 172 from the OFF website
search, because search-a-licious does not index Ukrainian or Czech as languages at all.

## What Changes

- The "Search language" setting becomes an ordered list of languages (primary first). Existing single-value
  settings keep working unchanged.
- Remote name search asks OFF for all selected languages at once, always including English as a catch-all
  for names stored in a product's main language.
- Product names (remote hits and local-mirror hits) are shown in the first language of the user's list that
  has a name, instead of only the single setting / always English.
- The language list gains Ukrainian and Czech; the country filter gains Ukraine and Czech Republic.
- Deployment note (not code): the diaitika server enables the existing local OFF mirror (`OFF_LOCAL_DB`),
  whose name search already matches every language, Ukrainian included. Tracked in `diaitika-infra`.

Upstream: yes — multilingual households and non-English OFF markets are common; the change is
backward compatible with the existing setting and with older app versions reading it.

Out of scope: switching remote search to the legacy OFF website search (rate-limited, being deprecated);
translating local catalogs (CIQUAL, USDA); barcode lookup naming; Android-native UI changes beyond what the
shared Svelte code provides.

## Capabilities

### New Capabilities
- `off-food-search`: searching Open Food Facts by name (remote search-a-licious and the local mirror),
  the language/country preferences that shape it, and which localized name is shown for a result.

### Modified Capabilities
<!-- none: no specs exist yet in this fork -->

## Impact

- Client: `src/lib/api.js` (search URL, language preference), `src/lib/off-name.js` (name choice),
  `src/routes/settings/ConnectedServices.svelte` (settings UI), `src/i18n/en.json` (new strings).
- Server: `server/lib/off-local.js` and `server/routes/proxy.js` (mirror result naming honours the request's
  languages).
- Settings storage: `offSearchLanguage` keeps its key; the value may now be a comma-separated list.
- Tests: `scripts/off-name.test.js` and new tests for the search URL and mirror naming.
