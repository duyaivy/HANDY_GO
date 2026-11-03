import { describe, expect, it } from 'vitest';
import { truncateAll, withDb } from './helpers/db.js';
import { publishAndConsumeOnce } from './helpers/rabbit.js';

describe('wallet test infra', () => {
  it('Postgres test truy cập được và có schema wallet_service đã migrate', async () => {
    const res = await withDb(async (c) => {
      const one = await c.query('SELECT 1 AS ok');
      const tables = await c.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'wallet_service'",
      );
      return { ok: one.rows[0].ok, tables: tables.rows.map((r) => r.tablename) };
    });
    expect(res.ok).toBe(1);
    expect(res.tables).toEqual(expect.arrayContaining(['wallets', 'wallet_audit_logs', 'dead_letter_events']));
  });

  it('truncateAll chạy được trên DB test', async () => {
    await expect(truncateAll()).resolves.toBeUndefined();
  });

  it('RabbitMQ test publish -> consume', async () => {
    const out = await publishAndConsumeOnce('wallet-infra-smoke', { hello: 'wallet' });
    expect(out).toEqual({ hello: 'wallet' });
  });
});
