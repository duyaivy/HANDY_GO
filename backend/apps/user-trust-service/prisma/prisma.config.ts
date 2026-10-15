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

function getDatabaseUrl(): string {
  const urlStr =
    process.env.DATABASE_URL_USER_TRUST ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/handygo?schema=user_trust_service';

  try {
    const url = new URL(urlStr);
    if (!url.searchParams.has('schema')) {
      url.searchParams.set('schema', 'user_trust_service');
    }
    return url.toString();
  } catch {
    return urlStr;
  }
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
