// Only a disposable local database is accepted. Never reads a production env file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/wallet-client';

const raw = process.env.WALLET_MIGRATION_TEST_URL;
const url = new URL(raw);
assert(['localhost', '127.0.0.1'].includes(url.hostname), 'Local test database required');
assert.equal(url.pathname, '/wallet_migration_test');
url.searchParams.set('schema', 'wallet_service');
const env = { ...process.env, DATABASE_URL: url.href, DATABASE_URL_WALLET: url.href };
const source = path.resolve('apps/wallet-service/prisma');
const migrations = readdirSync(path.join(source, 'migrations')).filter(n => /^\d/.test(n)).sort();
const temporary = mkdtempSync(path.resolve('.wallet-migration-test-'));
const client = new Client({ connectionString: url.href });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }, { schema: 'wallet_service' }) });
function deploy(config) {
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--config', config], { env, stdio: 'pipe' });
  } catch {
    throw new Error('Local wallet migrate deploy failed (CLI output suppressed to protect credentials)');
  }
}
try {
  await client.connect();
  const existing = await client.query("SELECT to_regnamespace('wallet_service') AS schema");
  assert.equal(existing.rows[0].schema, null, 'Use a fresh disposable database');
  for (const name of ['schema.prisma', 'prisma.config.ts']) copyFileSync(path.join(source, name), path.join(temporary, name));
  mkdirSync(path.join(temporary, 'migrations'));
  copyFileSync(path.join(source, 'migrations/migration_lock.toml'), path.join(temporary, 'migrations/migration_lock.toml'));
  // Upgrade from the release immediately preceding the payout contract.
  for (const name of migrations.slice(0, -1)) {
    mkdirSync(path.join(temporary, 'migrations', name));
    copyFileSync(path.join(source, 'migrations', name, 'migration.sql'), path.join(temporary, 'migrations', name, 'migration.sql'));
  }
  deploy(path.join(temporary, 'prisma.config.ts'));
  const wallet = await client.query("INSERT INTO wallet_service.wallets (system_key, balance) VALUES ('MIGRATION_FIXTURE', 500) RETURNING id");
  const withdrawal = await client.query(`INSERT INTO wallet_service.withdrawals
    (user_id, wallet_id, bank_account_id, amount, idempotency_key)
    VALUES (gen_random_uuid(), $1, gen_random_uuid(), 100, 'migration-fixture') RETURNING id`, [wallet.rows[0].id]);
  deploy(path.join(source, 'prisma.config.ts'));
  deploy(path.join(source, 'prisma.config.ts'));
  assert.equal((await client.query('SELECT count(*)::int AS count FROM wallet_service._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].count, migrations.length);
  assert.equal((await client.query("SELECT balance FROM wallet_service.wallets WHERE system_key = 'MIGRATION_FIXTURE'")).rows[0].balance, '500');
  assert((await client.query('SELECT payout_operation_id FROM wallet_service.withdrawals WHERE id = $1', [withdrawal.rows[0].id])).rows[0].payout_operation_id);
  // Old release inserts omit new columns; defaults must keep these writes working.
  await client.query(`INSERT INTO wallet_service.withdrawals (user_id, wallet_id, bank_account_id, amount, idempotency_key)
    VALUES (gen_random_uuid(), $1, gen_random_uuid(), 100, 'old-release-after-upgrade')`, [wallet.rows[0].id]);
  for (let attempt = 0; attempt < 2; attempt++) {
    await prisma.wallet.upsert({ where: { systemKey: 'PLATFORM_FEES' }, create: { systemKey: 'PLATFORM_FEES' }, update: {} });
  }
  assert.equal(await prisma.wallet.count({ where: { systemKey: 'PLATFORM_FEES' } }), 1);
  assert.equal((await client.query("SELECT to_regclass('public.wallets') AS table_name")).rows[0].table_name, null);
  console.log('Wallet migrations: fresh schema, upgrade/data preservation, repeat deploy, old writes and startup upsert passed');
} finally {
  await prisma.$disconnect();
  await client.end();
  rmSync(temporary, { recursive: true, force: true });
}
