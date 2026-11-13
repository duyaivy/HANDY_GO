// Destructive only inside newly-created databases on explicitly allowlisted loopback targets.
// No .env is read by this runner. Child configs receive explicit local DIRECT_URLs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/order-client';
import { databasePoolConfig } from '../../libs/database/src/pool.config.ts';

const url = new URL(process.env.INCIDENT_DATABASE_TEST_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only loopback test databases allowed');
assert(['/incident_test', '/wallet_migration_test'].includes(url.pathname), 'Disposable test database required');
const admin = new Client({ connectionString: url.href });
const created = [];
const drift = [];
const services = readdirSync('apps').filter(name => {
  try { return readdirSync(`apps/${name}/prisma`).includes('schema.prisma'); } catch { return false; }
}).map(name => name.replace(/-service$/, ''));
const prismaCli = path.resolve('node_modules/prisma/build/index.js');
function cli(args, env) {
  try { return execFileSync(process.execPath, [prismaCli, ...args], { env, encoding: 'utf8' }); }
  catch (error) {
    // All URLs here are synthetic local credentials; still avoid printing them.
    throw new Error(`Prisma ${args[0]} ${args[1]} failed: ${String(error.stdout || '').replace(/postgres(?:ql)?:\/\/\S+/g, '[database URL]')}`);
  }
}
try {
  await admin.connect();
  for (const service of services) {
    const database = `handygo_incident_${service.replaceAll('-', '_')}`;
    await admin.query(`CREATE DATABASE "${database}"`); // Existing DB => fail; never overwrite.
    created.push(database);
    const target = new URL(url); target.pathname = '/' + database;
    // Message owns schema "message"; the other services use the *_service convention.
    const schema = service === 'message' ? 'message' : service.replaceAll('-', '_') + '_service';
    target.searchParams.set('schema', schema);
    const suffix = service.toUpperCase().replaceAll('-', '_');
    const env = { ...process.env, NODE_ENV: 'production', HANDYGO_MIGRATION: '1',
      DATABASE_URL: target.href, [`DATABASE_URL_${suffix}`]: target.href, [`DIRECT_URL_${suffix}`]: target.href };
    const config = service === 'catalog' ? 'apps/catalog-service/prisma.config.ts' : `apps/${service}-service/prisma/prisma.config.ts`;
    cli(['migrate', 'deploy', '--config', config], env);
    cli(['migrate', 'deploy', '--config', config], env);
    try { cli(['migrate', 'diff', '--config', config, '--from-config-datasource', '--to-schema', `apps/${service}-service/prisma/schema.prisma`, '--exit-code'], env); }
    catch (error) { drift.push(`${service}: ${error.message}`); }
    const generated = await import(service === 'catalog' ? '@prisma/client' : `@prisma/${service}-client`);
    const db = new generated.PrismaClient({ adapter: new PrismaPg({ connectionString: target.href, max: 1 }, { schema }) });
    try {
      for (const model of generated.Prisma.dmmf.datamodel.models) {
        await db[model.name[0].toLowerCase() + model.name.slice(1)].findFirst();
      }
    } finally { await db.$disconnect(); }
    console.log(`${service}: migrations deploy twice; all Prisma models readable`);
  }

  const target = new URL(url); target.pathname = '/handygo_incident_order';
  process.env.DB_POOL_MAX_ORDER = '1';
  process.env.DB_POOL_TIMEOUT_MS = '150';
  const prisma = new PrismaClient({ adapter: new PrismaPg(databasePoolConfig(target.href, 'order')) });
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let entered;
  const active = new Promise(resolve => { entered = resolve; });
  try {
    await prisma.$connect();
    const occupied = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT 1`; entered(); await barrier; }, { timeout: 5000 });
    await active;
    // A second query cannot create a second connection, and times out rather than hanging.
    await assert.rejects(prisma.$queryRaw`SELECT 2`);
    release(); await occupied;
    assert.equal((await prisma.$queryRaw`SELECT 3 AS value`)[0].value, 3);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='handygo-order'")).rows[0].n, 1);
    await prisma.$disconnect();
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='handygo-order'")).rows[0].n, 0);
    await prisma.$connect();
    assert.equal((await prisma.$queryRaw`SELECT 4 AS value`)[0].value, 4);
    console.log('Prisma v7: max=1, bounded acquisition failure, recovery, disconnect disposal and reconnect passed');
  } finally { release?.(); await prisma.$disconnect(); }

  // Real server-side connection exhaustion, distinct from adapter acquisition timeout.
  await admin.query("CREATE ROLE handygo_incident_limited LOGIN PASSWORD 'local_only' CONNECTION LIMIT 1");
  const limited = new URL(target); limited.username = 'handygo_incident_limited'; limited.password = 'local_only';
  const first = new Client({ connectionString: limited.href });
  const second = new Client({ connectionString: limited.href });
  try {
    await first.connect();
    await assert.rejects(second.connect(), error => error.code === '53300');
  } finally { await first.end(); await second.end(); }
  const recovered = new Client({ connectionString: limited.href });
  try { await recovered.connect(); await recovered.query('SELECT 1'); } finally { await recovered.end(); }
  await admin.query('DROP ROLE handygo_incident_limited');
  assert.deepEqual(drift, JSON.parse(readFileSync(new URL('./migration-drift.expected.json', import.meta.url), 'utf8')), 'Unreviewed migration schema drift');
  console.log('Schema diff matches documented existing defaults/index/FK differences; no new drift');
  console.log('PostgreSQL server connection exhaustion (53300) and recovery passed; provider XX000 is covered by fault-injection tests');
} finally {
  for (const database of created.reverse()) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
}
