import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import { migrationUrl } from '../../../scripts/migration-url.js';

const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
];
const envPath = envPaths.find(existsSync);
if (envPath) process.loadEnvFile(envPath);

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: migrationUrl('payment', 'payment_service') },
});
