import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
];
const envPath = envPaths.find(existsSync);
if (envPath) process.loadEnvFile(envPath);

const rawUrl = process.env.DATABASE_URL_PAYMENT || process.env.DATABASE_URL;
if (!rawUrl) throw new Error('DATABASE_URL_PAYMENT or DATABASE_URL must be configured');
const url = new URL(rawUrl);
url.searchParams.set('schema', 'payment_service');

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: url.toString() },
});
