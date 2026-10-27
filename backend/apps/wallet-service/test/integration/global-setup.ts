import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadTestEnv(): void {
  const file = path.resolve(import.meta.dirname, '../../../../.env.wallet-test');
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

export function assertTestTarget(): void {
  const db = new URL(process.env.DATABASE_URL_WALLET ?? '');
  const dbName = db.pathname.replace(/^\//, '');
  if (!['localhost', '127.0.0.1'].includes(db.hostname) || db.port !== '55432' || !dbName.includes('test')) {
    throw new Error(`GUARD: DATABASE_URL_WALLET không phải DB test local (${db.hostname}:${db.port}/${dbName})`);
  }
  const mq = new URL(process.env.RABBITMQ_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(mq.hostname) || mq.port !== '56672') {
    throw new Error(`GUARD: RABBITMQ_URL không phải broker test local (${mq.hostname}:${mq.port})`);
  }
}

export default async function setup(): Promise<void> {
  loadTestEnv();
  assertTestTarget();

  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`Postgres test chưa chạy (pnpm run test:wallet:up): ${(e as Error).message}`);
  } finally {
    await client.end().catch(() => undefined);
  }

  const amqp = await import('amqplib');
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL as string);
    await conn.close();
  } catch (e) {
    throw new Error(`RabbitMQ test chưa chạy (pnpm run test:wallet:up): ${(e as Error).message}`);
  }
}
