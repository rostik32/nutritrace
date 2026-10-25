/**
 * The local OFF mirror's search database (openspec change
 * off-mirror-fast-search). A name search on the stock Parquet snapshot took
 * ~13 s and a barcode lookup ~5 s; the server now builds a compact DuckDB file
 * next to the mirror and answers from it. These tests pin what must not
 * change: the same queries return identical responses with and without the
 * database, a refreshed mirror keeps being served by the previous database
 * until the rebuild replaces it, a failed build leaves the old one answering,
 * and OFF_LOCAL_INDEX=off turns the whole thing off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// code, localized names, brands, lang, popularity_key
const PRODUCTS = [
  ['3017620422003', [['main', 'Nutella'], ['en', 'Nutella'], ['fr', 'Nutella']], 'Ferrero', 'fr', 100],
  ['0000000000017', [['main', 'Crème fraîche épaisse'], ['fr', 'Crème fraîche épaisse']], 'Président', 'fr', 50],
  ['0000000000024', [['main', 'Creme fraiche light'], ['en', 'Creme fraiche light']], 'Generic', 'en', 10],
  ['5705830010780', [['main', 'Kidney Bønner'], ['da', 'Kidney Bønner'], ['en', 'Kidney beans']], 'Rema 1000', 'da', 30],
  ['4820001114419', [['main', 'Картопля молода'], ['uk', 'Картопля молода'], ['ru', 'Картофель молодой']], 'Farm', 'uk', 5],
  ['4820000000006', [['main', 'Сирники з бананом'], ['uk', 'Сирники з бананом']], 'Галичина', 'uk', 7],
  ['4820000000013', [['main', 'Сирники'], ['uk', 'Сирники']], 'Farm', 'uk', 7],
  ['8594003840016', [['main', 'Tvaroh měkký'], ['cs', 'Tvaroh měkký']], 'Madeta', 'cs', null],
  ['1111111111116', [['main', "Bacon Egg and Cheese Croissant (Dunkin')"]], "Dunkin'", 'en', 20],
  ['2222222222222', [['main', 'Croissant au beurre']], "Dunkin'", 'fr', 20],
  ['0036000291452', [['main', 'Tissues']], 'Kleenex', 'en', 1],
  ['3333333333333', [['main', null], ['en', 'Milk 3.2%']], 'Farm', 'en', 7],
  ...Array.from({ length: 9 }, (_, i) =>
    [`70000000000${i}`, [['main', `${i % 2 ? 'Whole' : 'Skimmed'} milk ${i}`]], i % 3 ? 'Dairy' : null, 'en', i % 4]),
];

const sqlStr = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const valuesSql = (rows) => rows.map(([code, names, brands, lang, pop]) => `(
  ${sqlStr(code)},
  [${names.map(([l, t]) => `{'lang': ${sqlStr(l)}, 'text': ${sqlStr(t)}}`).join(', ')}],
  ${sqlStr(brands)}, ${sqlStr(lang)}, ${pop == null ? 'NULL' : pop}::BIGINT)`).join(',\n');

async function writeParquet(DuckDBInstance, file, rows) {
  const inst = await DuckDBInstance.create(':memory:');
  const conn = await inst.connect();
  await conn.run(`COPY (
    SELECT code, product_name, brands, lang, popularity_key,
           [{'lang': 'main', 'text': 'Generic ' || code}] AS generic_name,
           string_split(lower(COALESCE(brands, '')), ' ') AS brands_tags,
           'Food' AS categories, ['en:food'] AS categories_tags,
           0.5::DOUBLE AS completeness, '100 g' AS quantity, '30' AS serving_quantity, '30 g' AS serving_size,
           [{'name': 'energy-kcal', 'value': length(code)::DOUBLE, '100g': length(code)::DOUBLE,
             'serving': NULL::DOUBLE, 'unit': 'kcal', 'modifier': NULL::VARCHAR}] AS nutriments,
           [{'key': 'front_' || lang, 'imgid': 1::BIGINT, 'rev': 3::BIGINT}] AS images,
           'ignored by the search database' AS ingredients_text
      FROM (VALUES ${valuesSql(rows)}) AS v(code, product_name, brands, lang, popularity_key)
  ) TO '${file}' (FORMAT PARQUET)`);
  conn.closeSync();
  inst.closeSync();
}

const QUERIES = [
  ['nutella'], ['crème'], ['creme fraiche'], ['fraiche epaisse'], ['kidney'], ['beans'],
  ['картопля', { langs: ['uk', 'ru', 'en'] }], ['картофель', { langs: ['ru', 'uk'] }],
  ['сирники'], ['tvaroh'], ['mekky'], ['dunkin croissant'], ['croissant dunkin'], ['président'],
  ['3017620422003'], ['48200'], ['milk'], ['milk', { pageSize: 3, page: 2 }],
  ['farm'], ['nothing-matches-this'], ['+countries_tags:"en:ukraine" сирники'],
  // A literal % or _ is escaped, not a wildcard ("skimmed_milk" must not match "Skimmed milk").
  ['3.2%'], ['skimmed_milk'], ['back\\slash'],
];

test('the search database answers exactly like the mirror file, then follows refreshes', async (t) => {
  let DuckDBInstance;
  try {
    ({ DuckDBInstance } = await import('../server/node_modules/@duckdb/node-api/lib/index.js'));
  } catch {
    t.skip('@duckdb/node-api is not installed here');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'off-index-'));
  const file = join(dir, 'off.parquet');
  await writeParquet(DuckDBInstance, file, PRODUCTS);
  delete process.env.OFF_LOCAL_INDEX;
  process.env.OFF_LOCAL_DB = file;
  const off = await import('../server/lib/off-local.js');
  const indexFile = off.getIndexPath();
  assert.equal(indexFile, `${file}.search.duckdb`);

  // Without a database: the Parquet path, and nothing is built behind our back.
  const plain = [];
  for (const [q, opts] of QUERIES) plain.push(await off.searchByName(q, opts));
  const plainCodes = {
    hit: await off.lookupByBarcode('5705830010780'),
    miss: await off.lookupByBarcode('9999999999999'),
    upca: await off.lookupByBarcode('036000291452'),
  };
  assert.equal(off.getStatus().search_index.state, 'absent');
  assert.equal(existsSync(indexFile), false);
  assert.ok(plain.some(r => r.count > 0), 'fixture sanity: queries match something');
  assert.equal(plain[QUERIES.findIndex(([q]) => q === 'fraiche epaisse')].count, 1, 'fixture sanity: accent retry');
  assert.equal(plain[QUERIES.findIndex(([q]) => q === '3.2%')].count, 1, 'fixture sanity: literal %');
  assert.equal(plain[QUERIES.findIndex(([q]) => q === 'skimmed_milk')].count, 0, 'fixture sanity: literal _');

  // A leftover partial file from an interrupted build is cleared, never used.
  writeFileSync(`${indexFile}.new`, 'partial');
  const pending = off.buildSearchIndex({ source: 'test' });
  assert.equal(off.getStatus().search_index.state, 'building');
  const built = await pending;
  assert.equal(built.ok, true);
  assert.equal(built.rows, PRODUCTS.length);
  assert.equal(existsSync(`${indexFile}.new`), false);
  const status = off.getStatus().search_index;
  assert.equal(status.state, 'ready');
  assert.ok(status.size_bytes > 0 && status.built_at > 0);
  {
    const inst = await DuckDBInstance.create(indexFile, { access_mode: 'READ_ONLY' });
    const conn = await inst.connect();
    const meta = (await conn.runAndReadAll('SELECT * FROM meta')).getRowObjects()[0];
    assert.equal(Number(meta.row_count), PRODUCTS.length);
    assert.ok(!String(meta.columns).includes('ingredients_text'), 'only displayed columns are kept');
    const row = (code) => conn.runAndReadAll(
      `SELECT m_names, m_names_f, m_brands, m_brands_f FROM search_products WHERE code = $1`, [code]
    ).then(r => r.getRowObjects()[0]);
    assert.deepEqual(await row('3017620422003'),
      { m_names: '\x1fnutella\x1fnutella\x1fnutella', m_names_f: null, m_brands: 'ferrero', m_brands_f: null });
    const accented = await row('0000000000017');
    assert.equal(accented.m_names_f, '\x1fcreme fraiche epaisse\x1fcreme fraiche epaisse');
    assert.equal(accented.m_brands_f, 'president');
    assert.equal((await row('3333333333333')).m_names, '\x1fmilk 3.2%', 'a missing name is skipped');
    conn.closeSync();
    inst.closeSync();
  }

  // Identical responses, field for field, page for page.
  for (let i = 0; i < QUERIES.length; i++) {
    const [q, opts] = QUERIES[i];
    assert.deepEqual(await off.searchByName(q, opts), plain[i], `search "${q}" ${JSON.stringify(opts || {})}`);
  }
  assert.deepEqual(await off.lookupByBarcode('5705830010780'), plainCodes.hit);
  assert.deepEqual(await off.lookupByBarcode('9999999999999'), plainCodes.miss);
  assert.deepEqual(await off.lookupByBarcode('036000291452'), plainCodes.upca, '12-digit UPC-A retry');

  // Pages partition the ordered matches with no gaps or duplicates.
  const all = (await off.searchByName('milk', { pageSize: 100 })).hits.map(h => h.code);
  const paged = [];
  for (let page = 1; page <= 4; page++) paged.push(...(await off.searchByName('milk', { pageSize: 3, page })).hits.map(h => h.code));
  assert.deepEqual(paged, all);

  // Ranking: a name starting with the query first, then popularity, then code.
  assert.deepEqual((await off.searchByName('сирники')).hits.map(h => h.code), ['4820000000006', '4820000000013']);
  assert.deepEqual((await off.searchByName('croissant')).hits.map(h => h.code), ['2222222222222', '1111111111116']);

  // The mirror is refreshed (as _runRefresh does: rename over, reopen). The
  // previous database is stale but keeps answering until the rebuild.
  const next = join(dir, 'next.parquet');
  await writeParquet(DuckDBInstance, next, [
    ...PRODUCTS,
    ['4820000000020', [['main', 'Сирники класичні'], ['uk', 'Сирники класичні']], 'Farm', 'uk', 99],
  ]);
  renameSync(next, file);
  await off.reopenConnection();
  assert.equal(off.getStatus().search_index.state, 'stale');
  assert.equal((await off.searchByName('сирники')).count, 2, 'old data until the rebuild');
  await off.buildSearchIndex({ source: 'test-refresh' });
  assert.equal(off.getStatus().search_index.state, 'ready');
  const fresh = await off.searchByName('сирники');
  assert.equal(fresh.count, 3);
  assert.equal(fresh.hits[0].code, '4820000000020', 'new product, most popular');

  // A failed build keeps the previous database answering.
  mkdirSync(`${indexFile}.new`);
  writeFileSync(join(`${indexFile}.new`, 'blocker'), '');
  await assert.rejects(off.buildSearchIndex({ source: 'test-fail' }));
  assert.equal(off.getStatus().search_index.state, 'failed');
  assert.ok(off.getStatus().search_index.last_error);
  assert.equal((await off.searchByName('сирники')).count, 3);
  rmSync(`${indexFile}.new`, { recursive: true, force: true });

  // OFF_LOCAL_INDEX=off: nothing built, nothing read, the Parquet path again.
  process.env.OFF_LOCAL_INDEX = 'off';
  assert.equal((await off.buildSearchIndex({ source: 'test-off' })).skipped, 'disabled');
  await off.reopenConnection();
  assert.equal(off.getStatus().search_index.state, 'disabled');
  rmSync(indexFile, { force: true });
  assert.equal((await off.searchByName('сирники')).count, 3, 'answered from the Parquet file');
  delete process.env.OFF_LOCAL_INDEX;
});

test('a legacy native .duckdb mirror never gets a search database', async (t) => {
  let DuckDBInstance;
  try {
    ({ DuckDBInstance } = await import('../server/node_modules/@duckdb/node-api/lib/index.js'));
  } catch {
    t.skip('@duckdb/node-api is not installed here');
    return;
  }
  const { spawnSync } = await import('node:child_process');
  const dbFile = join(mkdtempSync(join(tmpdir(), 'off-index-legacy-')), 'off.duckdb');
  const inst = await DuckDBInstance.create(dbFile);
  const conn = await inst.connect();
  await conn.run(`CREATE TABLE products AS SELECT '3017620422003' AS code, 'Nutella' AS product_name, 'Ferrero' AS brands`);
  conn.closeSync();
  inst.closeSync();
  // A fresh process: the module keeps its state per process.
  const script = `
    const off = await import(${JSON.stringify(new URL('../server/lib/off-local.js', import.meta.url).href)});
    const r = await off.buildSearchIndex();
    const s = await off.searchByName('nutella');
    console.log(JSON.stringify({ skipped: r.skipped, count: s.count, state: off.getStatus().search_index.state }));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, OFF_LOCAL_DB: dbFile, OFF_LOCAL_INDEX: '', LOG_LEVEL: 'error' }, encoding: 'utf8',
  });
  const out = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.deepEqual(out, { skipped: 'not a Parquet mirror', count: 1, state: 'disabled' });
  assert.equal(existsSync(`${dbFile}.search.duckdb`), false);
});
