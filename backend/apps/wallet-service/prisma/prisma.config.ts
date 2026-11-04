import { defineConfig } from 'prisma/config';
import { migrationUrl } from '../../../scripts/migration-url.js';

// Optional development ENV; containers supply their environment directly.
try { process.loadEnvFile(new URL('../../../.env', import.meta.url)); } catch { /* optional */ }

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: migrationUrl('wallet', 'wallet_service') },
});
