import { defineConfig } from 'prisma/config';
import { migrationUrl } from '../../../scripts/migration-url.js';

// No .env loading or shared DATABASE_URL fallback for this new service.
if (
  !process.env.DIRECT_URL_MESSAGE?.trim() &&
  !process.env.DATABASE_URL_MESSAGE?.trim()
) {
  throw new Error(
    'DIRECT_URL_MESSAGE or DATABASE_URL_MESSAGE is required explicitly',
  );
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: migrationUrl('message', 'message') },
});
