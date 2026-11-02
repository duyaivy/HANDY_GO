import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

// Always use the selected env file; credentials never appear in command arguments or logs.
process.loadEnvFile(process.env.PR34_ENV_FILE || '.env');
const raw = process.env.DATABASE_URL_MATCHING || process.env.DATABASE_URL;
if (!raw)
  throw new Error(
    'DATABASE_URL_MATCHING or DATABASE_URL is required in the environment',
  );
const schema = `pr34_test_${randomUUID().replaceAll('-', '')}`;
const url = new URL(raw);
url.searchParams.set('schema', schema);
const migrationUrl = new URL(process.env.DIRECT_URL_MATCHING || url);
if (
  migrationUrl.hostname.endsWith('.pooler.supabase.com') &&
  migrationUrl.port === '6543'
)
  migrationUrl.port = '5432';
migrationUrl.searchParams.set('schema', schema);
const env = {
  ...process.env,
  NODE_ENV: 'test',
  CI: 'true',
  DATABASE_URL_MATCHING: url.toString(),
  PR34_TEST_DATABASE_URL: url.toString(),
};
const admin = new pg.Client({
  connectionString: raw,
  connectionTimeoutMillis: 10000,
});
const run = (command, args, overrides = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...env, ...overrides },
      stdio: 'inherit',
      detached: true,
    });
    const timer = setTimeout(() => {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    }, 90000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`));
    });
  });
try {
  await admin.connect();
  console.log(
    `PR34: validating migrations and reliability in temporary schema ${schema}`,
  );
  await run(
    './node_modules/.bin/prisma',
    [
      'migrate',
      'deploy',
      '--schema=apps/matching-service/prisma/schema.prisma',
      '--config=apps/matching-service/prisma/prisma.config.ts',
    ],
    {
      DATABASE_URL_MATCHING: migrationUrl.toString(),
      DIRECT_URL_MATCHING: migrationUrl.toString(),
    },
  );
  await run('./node_modules/.bin/vitest', [
    'run',
    'apps/matching-service/test/matching-reliability-db.spec.ts',
  ]);
} finally {
  // Only this invocation's randomly generated schema is eligible for cleanup.
  if (/^pr34_test_[a-f0-9]{32}$/.test(schema)) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {
      console.error(`Cleanup needed for temporary schema ${schema}`);
    });
  }
  await admin.end();
}
