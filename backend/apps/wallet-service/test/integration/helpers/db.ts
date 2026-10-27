import { Client } from 'pg';
import { assertTestTarget } from '../global-setup.js';

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  assertTestTarget();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function truncateAll(): Promise<void> {
  await withDb(async (c) => {
    const { rows } = await c.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'wallet_service' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length === 0) return;
    const list = rows.map((r) => `"wallet_service"."${r.tablename}"`).join(', ');
    await c.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  });
}
