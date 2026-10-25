import { defineConfig } from 'prisma/config';
import { resolveNotificationDatabaseUrl } from '../src/common/notification-database.config.js';

for (const path of [
  new URL('../.env', import.meta.url),
  new URL('../../../.env', import.meta.url),
]) {
  try {
    process.loadEnvFile(path);
  } catch {
    // Environment variables can be supplied directly (CI/containers).
  }
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: {
    url: resolveNotificationDatabaseUrl(
      process.env.DATABASE_URL_NOTIFICATION,
      process.env.DATABASE_URL,
    ),
  },
});
