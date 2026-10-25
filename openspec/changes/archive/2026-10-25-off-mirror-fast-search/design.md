# Design

## Context

`server/lib/off-local.js` opens the stock OFF Parquet snapshot as an in-memory DuckDB view `products`
(`read_parquet`). The file has 111 columns, 4719 row groups of 1024 rows, and `product_name` is
`LIST<{lang, text}>`. All request-time queries share one connection through a FIFO queue (`_query`).

Measured on the diaitika server (Oracle A1, 4 OCPU, 24 GB, DuckDB 1.4.0, 2026-10-25):

| Operation on the Parquet view | Time |
|---|---|
| Name search (hits + COUNT, `list_filter` over names) | 12.7–14.6 s |
| Barcode lookup `SELECT * … WHERE code = $1` | ~5 s (metadata cache on), ~8 s (off) |
| Fetch 3 rows `SELECT * … WHERE code IN (…)` | 22–24 s |
| Fetch 3 rows by `file_row_number`, 14 needed columns, metadata cache on | 0.4–0.8 s |

| Operation on a native DuckDB table built from the Parquet | Time |
|---|---|
| Ranked match (`names/brands/code LIKE`, ORDER BY rank, popularity, code, LIMIT 20) | 215–280 ms |
| COUNT of matches | 210–255 ms (1.4 s once, cold) |
| Accent-folded COUNT (folded names stored, brands folded at query time) | 290–920 ms |
| Fetch 20 rows: `rid IN (…)` | 3.4 s |
| Fetch 20 rows: 20 point queries `rid = $1` (rid sorted) | 164 ms |
| Build: display columns (`CREATE TABLE AS … FROM read_parquet`) + match columns | ~45 s + ~5 s; ~1.5 GB |

## Goals / Non-Goals

**Goals:**
- Name search and barcode lookup under 1 s on the reference server, with results identical to today.
- No new runtime dependency, no network access for the index (air-gap mode keeps working).
- The index never makes things worse: missing, stale-while-rebuilding, broken or disabled → today's path.

**Non-Goals:**
- Changing ranking or matching semantics, adding fuzzy search, using DuckDB extensions.
- Supporting legacy native `.duckdb` mirrors (they keep the current queries).
- Building the index anywhere but on the server that holds the mirror.

## Decisions

### D1. A self-contained search database, not an index that points back into the Parquet file
The index holds the display columns itself, so a search never touches the Parquet file.
Alternatives measured:
- *Index of codes, rows fetched from Parquet by code*: 5–24 s per fetch — the slow part of today's search.
- *Index of `file_row_number`, rows fetched from Parquet*: 0.4–0.8 s for 3 rows; 20 scattered rows would
  touch up to 20 row groups and miss the 1 s target.
- *One JSON document per product*: 20.8 GB and slower to read (`to_json` of nested columns).
- *DuckDB `fts` extension*: downloaded at runtime (breaks air-gap), different tokenization and ranking.
- *Full conversion of the Parquet to DuckDB (all 111 columns)*: same size as the mirror, longer build, no
  benefit — only ~14 columns are read by `_toOffProduct`.

### D2. Layout: one table, row id sorted, folded columns only where they differ
File `<OFF_LOCAL_DB>.search.duckdb`, table `search_products`:
- `rid` — the Parquet `file_row_number` (inserted in order, so DuckDB zone maps make `rid = $1` a point read);
- display columns read by `_toOffProduct`, selected from those present in the snapshot (defensive, like
  the current code), keeping their names and types so the existing adapter works unchanged;
- `popularity_key` when present;
- match columns: `m_names` = `chr(31)` + lower-cased localized names joined by `chr(31)`, `m_brands` =
  lower-cased brands, and `m_names_f` / `m_brands_f` = their `strip_accents` forms, NULL when identical.

Joining names with `chr(31)` keeps today's semantics: a token never contains `chr(31)`, so it cannot match
across two names, and "some name starts with the phrase" becomes `m_names LIKE '%' || chr(31) || phrase || '%'`.
A `meta` table stores `schema_version`, the source file's size and mtime, row count and build time.

### D3. Two-step query: ranked row ids, then point reads
1. `SELECT rid … WHERE <every token in m_names | m_brands | code> ORDER BY rank, popularity_key DESC NULLS
   LAST, code LIMIT/OFFSET`, plus the COUNT with the same predicate (as today; folded columns via
   `COALESCE(m_names_f, m_names)` on the retry when the exact pass finds nothing).
2. One `SELECT <display columns> … WHERE rid = $1` per hit, in rank order. `IN (…)` is avoided: DuckDB does
   not prune zone maps for IN lists (3.4 s vs 164 ms measured).
A single top-N query returning display columns directly may turn out faster with DuckDB's late
materialization; the implementation may use it if a benchmark on the server shows it, without changing
results. Barcode lookup becomes `SELECT … WHERE code = $1` (and the UPC-A retry) on the same table.

### D4. Attach to the existing connection
The index file is `ATTACH`ed `READ_ONLY` into the existing in-memory instance, so the single connection and
the FIFO queue still serialize every query. Swapping indexes is `DETACH` + `ATTACH` issued through the
queue, so an in-flight search finishes on the old file first.

### D5. Lifecycle
- **Freshness**: an index is *fresh* when `meta` matches the mirror's size + mtime and `schema_version`
  equals the code's constant. A *stale* index (same `schema_version`, built from an earlier mirror file) is
  still attached and used while a rebuild runs — its data is self-consistent, just older. An index with a
  different `schema_version` or that fails to open is not used.
- **When to build**: from `primeFromStartup()` when the index is missing or not fresh, and at the end of a
  successful mirror refresh. Never lazily from a search, so the existing tests and a server without
  `primeFromStartup()` see no background work.
- **How**: a separate DuckDB instance writes `<index>.new` (removed first if left over), validates row
  count > 0 and `meta`, closes, `rename()`s over the index, then the live connection re-attaches. Single
  flight: a refresh during a build waits for it and then starts a new build.
- **Status**: `getStatus()` gains `search_index: { state: ready|stale|building|failed|disabled|absent,
  built_at, size_bytes, last_error }`.
- **Disable**: `OFF_LOCAL_INDEX=off` skips building and attaching. Legacy `.duckdb` mirrors report
  `disabled`.

## Risks / Trade-offs

- [Build load on a live server: ~1 min of DuckDB CPU and memory] → build instance uses fewer threads than
  cores and a temp directory next to the mirror so it can spill; runs only at startup-when-needed and after
  the weekly refresh.
- [Disk: ~1.5 GB index + ~1.5 GB while rebuilding] → documented in `DEPLOY.md`; the diaitika server has
  180 GB free.
- [Results drift between indexed and unindexed search] → parity tests run the same queries both ways on a
  fixture Parquet (multi-word, accents, Cyrillic, brands, barcodes, paging, ranking ties).
- [DuckDB version change makes the index unreadable] → open failure means "not usable": fall back and
  rebuild; `schema_version` bump for layout changes.
- [Crash mid-build leaves a partial file] → only `<index>.new` is ever partial; it is deleted at the next
  build and never attached.
- [`strip_accents` also folds letters like Ukrainian «й» → «и»] → unchanged behaviour: the retry already
  folds both sides the same way; the exact pass still runs first.

## Migration Plan

1. Merge → the fork image is built → deploy with the diaitika-infra runbook (backup first).
2. On first start the server builds the index in the background (~1 min); searches use the old path until
   then. Check `GET /api/off-local/status` or the log line `[off-local] search index ready`.
3. Rollback: deploy the previous image — it ignores the index file. Delete
   `/opt/nutritrace/off-mirror/off.parquet.search.duckdb` to reclaim the space, or set
   `OFF_LOCAL_INDEX=off` to keep the new image without the index.

## Open Questions

- Exact thread and memory limits for the build instance — tune on the server during implementation; does
  not change the approach or the tasks.
