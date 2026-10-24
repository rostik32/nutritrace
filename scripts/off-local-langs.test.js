/**
 * The local OFF mirror (Parquet, product_name is LIST<{lang, text}>) matches a
 * query against names in every language and names each hit in the user's
 * language order, sent by the client as `langs`. The default stays English.
 * See openspec change off-multilang-search.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('mirror hits are matched in any language and named in the requested order', async (t) => {
  let DuckDBInstance;
  try {
    ({ DuckDBInstance } = await import('../server/node_modules/@duckdb/node-api/lib/index.js'));
  } catch {
    t.skip('@duckdb/node-api is not installed here');
    return;
  }
  const file = join(mkdtempSync(join(tmpdir(), 'off-langs-')), 'off.parquet');
  const inst = await DuckDBInstance.create(':memory:');
  const conn = await inst.connect();
  await conn.run(`COPY (
    SELECT * FROM (VALUES
      ('1', [{'lang': 'main', 'text': 'Potatoes'}, {'lang': 'en', 'text': 'Potatoes'},
             {'lang': 'uk', 'text': 'Картопля молода'}, {'lang': 'ru', 'text': 'Картофель молодой'}], 'Farm', 'uk'),
      ('2', [{'lang': 'main', 'text': 'Сметана 20%'}, {'lang': 'ru', 'text': 'Сметана 20%'},
             {'lang': 'cs', 'text': 'Zakysaná smetana'}], 'Dairy', 'ru')
    ) AS v(code, product_name, brands, lang)
  ) TO '${file}' (FORMAT PARQUET)`);
  conn.closeSync();
  inst.closeSync();

  process.env.OFF_LOCAL_DB = file;
  const off = await import('../server/lib/off-local.js');

  const uk = await off.searchByName('картопля', { langs: ['uk', 'ru', 'en'] });
  assert.equal(uk.count, 1, 'a Ukrainian-only word finds the product');
  assert.equal(uk.hits[0].product_name, 'Картопля молода');

  const ruFirst = await off.searchByName('картопля', { langs: ['ru', 'uk'] });
  assert.equal(ruFirst.hits[0].product_name, 'Картофель молодой', 'the order decides the name');

  const byDefault = await off.searchByName('картопля');
  assert.equal(byDefault.hits[0].product_name, 'Potatoes', 'default English naming is unchanged');

  const missingFirst = await off.searchByName('smetana', { langs: ['uk', 'ru', 'en'] });
  assert.equal(missingFirst.hits[0].product_name, 'Сметана 20%', 'no Ukrainian name: the next language');
});
