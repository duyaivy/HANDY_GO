import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

for (const envPath of [path.resolve(process.cwd(), '.env'), path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env')]) {
  try { process.loadEnvFile(envPath); break; } catch { /* optional local env */ }
}

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL_WALLET || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/handygo?schema=wallet_service';
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('schema')) url.searchParams.set('schema', 'wallet_service');
    return url.toString();
  } catch { return raw; }
}

export default defineConfig({ schema: 'schema.prisma', migrations: { path: 'migrations' }, datasource: { url: databaseUrl() } });
