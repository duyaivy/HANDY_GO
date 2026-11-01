import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadTestEnv(): void {
  const file = path.resolve(import.meta.dirname, '../../../../.env.wallet-test');
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

function assertTestDatabaseUrl(name: string, raw: string | undefined): URL {
  let db: URL;
  try {
    db = new URL(raw ?? '');
  } catch {
    throw new Error(`GUARD: ${name} thiếu hoặc không hợp lệ`);
  }
  const dbName = db.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.includes(db.hostname) || db.port !== '55432' || !/(^|_)test($|_)/.test(dbName)) {
    throw new Error(`GUARD: ${name} không phải DB test local (${db.hostname}:${db.port}/${dbName})`);
  }
  return db;
}

/**
 * Validate mọi connection string mà test có thể dùng (Prisma dùng DATABASE_URL_WALLET,
 * fallback DATABASE_URL) và trả về URL duy nhất được dùng cho cả Prisma lẫn TRUNCATE.
 */
export function assertTestTarget(): string {
  const walletDb = assertTestDatabaseUrl('DATABASE_URL_WALLET', process.env.DATABASE_URL_WALLET);
  if (process.env.DATABASE_URL) {
    const other = assertTestDatabaseUrl('DATABASE_URL', process.env.DATABASE_URL);
    if (other.host !== walletDb.host || other.pathname !== walletDb.pathname) {
      throw new Error('GUARD: DATABASE_URL và DATABASE_URL_WALLET trỏ tới hai database khác nhau');
    }
  }
  const mq = new URL(process.env.RABBITMQ_URL ?? '');
  if (!['localhost', '127.0.0.1'].includes(mq.hostname) || mq.port !== '56672') {
    throw new Error(`GUARD: RABBITMQ_URL không phải broker test local (${mq.hostname}:${mq.port})`);
  }
  walletDb.searchParams.delete('schema');
  return walletDb.toString();
}

export default async function setup(): Promise<void> {
  loadTestEnv();
  const databaseUrl = assertTestTarget();

  const { Client } = await import('pg');
  const client = new Client({ connectionString: databaseUrl });
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
