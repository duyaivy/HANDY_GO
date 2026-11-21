import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import pg from 'pg';
import { DashboardCustomersController } from './dashboard-customers.controller.js';

const databaseUrl = process.env.DATABASE_URL_AUTH;
const migrations = new URL('../../prisma/migrations/', import.meta.url);
const historyMigration =
  '20261118000000_preserve_customer_registration_history';
const historySql = readFileSync(
  new URL(`${historyMigration}/migration.sql`, migrations),
  'utf8',
);

// Each test creates its own schema inside a transaction and always rolls it
// back. Never run migration SQL against the connection's application schema.
describe.skipIf(!databaseUrl)(
  'dashboard customer registration history PostgreSQL',
  () => {
    let client: pg.Client;
    const id = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    beforeAll(async () => {
      client = new pg.Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
      await client.connect();
    });
    beforeEach(async () => {
      await client.query('BEGIN');
      const schema = `hg74_customer_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      expect(
        (await client.query('SELECT current_schema() AS schema')).rows[0]
          .schema,
      ).toBe(schema);
      for (const migration of readdirSync(migrations).filter(
        (name) => name < historyMigration,
      )) {
        await client.query(
          readFileSync(
            new URL(`${migration}/migration.sql`, migrations),
            'utf8',
          ),
        );
      }
      await client.query(
        `INSERT INTO roles (id, code, name, created_at) VALUES
      ($1, 'CUSTOMER', 'Customer', '2026-01-01'), ($2, 'WORKER', 'Worker', '2026-01-01')`,
        [id(101), id(102)],
      );
    }, 15000);
    afterEach(async () => {
      await client.query('ROLLBACK');
    });
    afterAll(async () => {
      await client?.end();
    });

    async function migrateHistory() {
      // Preserve the test's outer transaction instead of committing its schema.
      expect(historySql.trim().startsWith('BEGIN;')).toBe(true);
      expect(historySql.trim().endsWith('COMMIT;')).toBe(true);
      await client.query(
        historySql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''),
      );
    }
    async function account(n: number, createdAt = '2026-01-01') {
      await client.query(
        `INSERT INTO accounts (id, user_id, password_hash, created_at, updated_at)
      VALUES ($1, $1, 'test-only', $2::timestamp, $2::timestamp)`,
        [id(n), createdAt],
      );
    }
    async function grant(n: number, assignedAt: string, role = 101) {
      await client.query(
        'INSERT INTO account_roles (account_id, role_id, assigned_at) VALUES ($1, $2, $3::timestamp)',
        [id(n), id(role), assignedAt],
      );
    }
    async function registeredBefore(end = '2026-02-01T00:00:00Z') {
      const controller = new DashboardCustomersController(
        {
          customerRegistration: {
            count: async ({
              where,
            }: {
              where: { registeredAt: { lt: Date } };
            }) =>
              (
                await client.query(
                  'SELECT COUNT(*)::int AS count FROM customer_registrations WHERE registered_at < $1::timestamp',
                  [where.registeredAt.lt.toISOString()],
                )
              ).rows[0].count,
          },
        } as never,
        { internalServiceSecret: 'secret' } as never,
      );
      return (await controller.registeredCustomers(end, 'secret')).data;
    }

    it('backfills current roles and original events even after revocation or reassignment', async () => {
      for (const n of [1, 2, 3, 4, 5]) await account(n);
      await grant(1, '2026-01-10');
      await grant(3, '2026-04-01'); // Current assignment alone lost the January registration.
      await grant(4, '2026-01-01', 102);
      for (const [n, data] of [
        [2, { accountId: id(2), roles: ['Customer', 'Worker'] }],
        [3, { accountId: id(3), role: 'Customer' }],
        [4, { accountId: id(4), role: 'Worker' }],
        [5, { userId: id(5), role: 'CUSTOMER' }],
      ] as const) {
        await client.query(
          `INSERT INTO outbox_events (id, "eventType", payload)
        VALUES ($1, 'user.registered', $2::jsonb)`,
          [String(n), JSON.stringify({ data })],
        );
      }
      await migrateHistory();
      expect(await registeredBefore()).toBe(4);
      const rows = (
        await client.query(
          'SELECT account_id, registered_at::text AS date FROM customer_registrations ORDER BY account_id',
        )
      ).rows;
      expect(rows.map((row) => row.account_id)).toEqual([1, 2, 3, 5].map(id));
      expect(rows.find((row) => row.account_id === id(3)).date).toBe(
        '2026-01-01 00:00:00',
      );
    });

    it('keeps past totals stable after role revocation, reassignment and account deletion', async () => {
      await migrateHistory();
      await account(1);
      await grant(1, '2026-01-10');
      expect(await registeredBefore()).toBe(1);
      await client.query('DELETE FROM account_roles WHERE account_id = $1', [
        id(1),
      ]);
      expect(await registeredBefore()).toBe(1);
      await grant(1, '2026-05-01');
      await client.query(
        "UPDATE account_roles SET assigned_at = '2026-06-01' WHERE account_id = $1",
        [id(1)],
      );
      expect(await registeredBefore()).toBe(1);
      await client.query('DELETE FROM account_roles WHERE account_id = $1', [
        id(1),
      ]);
      await client.query('DELETE FROM accounts WHERE id = $1', [id(1)]);
      expect(await registeredBefore()).toBe(1);
    });

    it('records a first CUSTOMER grant atomically, with an exclusive cutoff and no worker-only count', async () => {
      await migrateHistory();
      await account(1);
      await account(2);
      await account(3, '2026-03-01');
      await grant(1, '2026-02-01');
      await grant(2, '2026-01-01', 102);
      await grant(3, '2026-01-01'); // A registration cannot precede account creation.
      expect(await registeredBefore()).toBe(0);
      expect(await registeredBefore('2026-02-01T00:00:01Z')).toBe(1);
      expect(await registeredBefore('2026-03-01T00:00:01Z')).toBe(2);
      await client.query('SAVEPOINT registration');
      await grant(2, '2026-01-01');
      expect(await registeredBefore()).toBe(1);
      await client.query('ROLLBACK TO SAVEPOINT registration');
      expect(await registeredBefore()).toBe(0);
    });

    it('rejects edits or deletion of persisted registration facts', async () => {
      await migrateHistory();
      await account(1);
      await grant(1, '2026-01-01');
      for (const sql of [
        "UPDATE customer_registrations SET registered_at = '2026-06-01'",
        'DELETE FROM customer_registrations',
      ]) {
        await client.query('SAVEPOINT immutable_history');
        await expect(client.query(sql)).rejects.toThrow('append-only');
        await client.query('ROLLBACK TO SAVEPOINT immutable_history');
      }
      expect(await registeredBefore()).toBe(1);
    });
  },
);
