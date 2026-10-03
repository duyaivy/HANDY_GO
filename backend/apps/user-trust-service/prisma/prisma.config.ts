import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
];

for (const envPath of candidateEnvPaths) {
  try {
    process.loadEnvFile(envPath);
    break;
  } catch {
    // ignore if .env is missing
  }
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url:
      process.env.DATABASE_URL_USER_TRUST ||
      'postgresql://postgres:postgres@localhost:5433/handy_user_trust',
  },
});

