// Exercises legacy public history -> canonical Catalog history on local fixtures.
// Never reads .env; all child migration URLs are explicitly overridden to local.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const raw = process.env.CATALOG_BASELINE_TEST_DATABASE_URL;
assert(raw, 'Set CATALOG_BASELINE_TEST_DATABASE_URL to a fresh local disposable DB');
const target = new URL(raw);
assert(['localhost', '127.0.0.1'].includes(target.hostname), 'Only loopback targets allowed');
assert.equal(target.pathname, '/catalog_search_test', 'Disposable catalog_search_test DB required');
const canonical = new URL(target); canonical.searchParams.set('schema', 'catalog_service');
const legacy = new URL(target); legacy.searchParams.set('schema', 'public');
const env = {
  ...process.env,
  NODE_ENV: 'production', HANDYGO_MIGRATION: '1',
  DATABASE_URL: canonical.href, DATABASE_URL_CATALOG: canonical.href, DIRECT_URL_CATALOG: canonical.href,
  CATALOG_MIGRATION_LEGACY_TEST_URL: legacy.href,
};
const cli = path.resolve('node_modules/prisma/build/index.js');
const initial = '20261001000000_init_catalog';
const extension = '20261106000000_catalog_unaccent';
const config = 'apps/catalog-service/prisma.config.ts';
const temporary = mkdtempSync(path.resolve('.catalog-baseline-test-'));
const sql = new Client({ connectionString: target.href });
function prisma(args, expectedCode = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 60000 });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.equal(result.error, undefined, 'Local Prisma CLI must finish');
  assert.equal(result.status, expectedCode, 'Unexpected Prisma exit code (URLs/output suppressed)');
  return output;
}
try {
  await sql.connect();
  const existing = await sql.query("SELECT to_regnamespace('catalog_service') AS schema, to_regclass('public._prisma_migrations') AS history");
  assert.deepEqual(existing.rows, [{ schema: null, history: null }], 'Use a fresh empty disposable DB');
  mkdirSync(path.join(temporary, 'migrations', initial), { recursive: true });
  const initialSql = path.resolve(`apps/catalog-service/prisma/migrations/${initial}/migration.sql`);
  copyFileSync(initialSql, path.join(temporary, 'migrations', initial, 'migration.sql'));
  const legacyConfig = path.join(temporary, 'prisma.config.ts');
  writeFileSync(legacyConfig, `import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(path.resolve('apps/catalog-service/prisma/schema.prisma'))}, migrations: { path: './migrations' }, datasource: { url: process.env.CATALOG_MIGRATION_LEGACY_TEST_URL } });\n`);
  prisma(['migrate', 'deploy', '--config', legacyConfig]);
  // Match the observed legacy database's known outbox default drift.
  await sql.query('ALTER TABLE catalog_service.outbox_events ALTER COLUMN id DROP DEFAULT');
  const category = randomUUID();
  const service = randomUUID();
  const event = randomUUID();
  await sql.query("INSERT INTO catalog_service.categories(id,name,updated_at) VALUES ($1,'Cắt tỉa cảnh',now())", [category]);
  await sql.query("INSERT INTO catalog_service.services(id,category_id,name,updated_at) VALUES ($1,$2,'Cắt tỉa cảnh',now())", [service, category]);
  await sql.query("INSERT INTO catalog_service.outbox_events(id,event_type,payload) VALUES ($1,'fixture.event','{}')", [event]);
  const before = (await sql.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(c)) FROM catalog_service.categories c) AS categories,
    (SELECT jsonb_agg(to_jsonb(s)) FROM catalog_service.services s) AS services,
    (SELECT jsonb_agg(to_jsonb(e)) FROM catalog_service.outbox_events e) AS events`)).rows;

  const failure = prisma(['migrate', 'deploy', '--config', config], 1);
  assert.match(failure, /P3005/, 'Canonical deploy must reproduce missing-history failure');
  console.log('RED reproduced: canonical migrate deploy fails P3005 with legacy history in public');

  const history = (await sql.query('SELECT migration_name,checksum,finished_at IS NOT NULL AS completed,rolled_back_at FROM public._prisma_migrations')).rows;
  assert.equal(history.length, 1);
  assert.equal(history[0].migration_name, initial);
  assert.equal(history[0].checksum, createHash('sha256').update(readFileSync(initialSql)).digest('hex'));
  assert.equal(history[0].completed, true);
  assert.equal(history[0].rolled_back_at, null);
  prisma(['migrate', 'resolve', '--applied', initial, '--config', config]);
  prisma(['migrate', 'deploy', '--config', config]);
  prisma(['migrate', 'deploy', '--config', config]);
  const canonicalHistory = (await sql.query('SELECT migration_name FROM catalog_service._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
  assert.deepEqual(canonicalHistory, [{ migration_name: initial }, { migration_name: extension }]);
  const after = (await sql.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(c)) FROM catalog_service.categories c) AS categories,
    (SELECT jsonb_agg(to_jsonb(s)) FROM catalog_service.services s) AS services,
    (SELECT jsonb_agg(to_jsonb(e)) FROM catalog_service.outbox_events e) AS events`)).rows;
  assert.deepEqual(after, before, 'Baseline and extension must preserve all fixture data');
  assert.deepEqual((await sql.query('SELECT migration_name,checksum,finished_at IS NOT NULL AS completed,rolled_back_at FROM public._prisma_migrations')).rows, history, 'Legacy history stays intact');
  assert.equal((await sql.query("SELECT column_default FROM information_schema.columns WHERE table_schema='catalog_service' AND table_name='outbox_events' AND column_name='id'")).rows[0].column_default, null);
  assert.equal((await sql.query("SELECT catalog_service.unaccent('catalog_service.unaccent'::regdictionary,'Cắt tỉa cảnh') ILIKE '%cat tia%' AS matched")).rows[0].matched, true);
  console.log('GREEN: baseline initial only, deploy extension twice, both histories and all fixture data preserved; accent search works');
} finally {
  await sql.end();
  rmSync(temporary, { recursive: true, force: true });
}
