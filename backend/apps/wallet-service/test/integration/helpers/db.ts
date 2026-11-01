import { Client } from 'pg';
import { assertTestTarget } from '../global-setup.js';

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: assertTestTarget() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function truncateAll(): Promise<void> {
  await withDb(async (c) => {
    const { rows: dbRows } = await c.query<{ db: string }>('SELECT current_database() AS db');
    if (!/(^|_)test($|_)/.test(dbRows[0]?.db ?? '')) {
      throw new Error(`GUARD: refuse TRUNCATE trên database "${dbRows[0]?.db}"`);
    }
    const { rows } = await c.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'wallet_service' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length === 0) return;
    const list = rows.map((r) => `"wallet_service"."${r.tablename}"`).join(', ');
    await c.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  });
}
