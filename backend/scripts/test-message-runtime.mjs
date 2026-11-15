// Owns a disposable container; never loads .env or accepts caller DB URLs.
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
const name = `handygo-message-runtime-${randomUUID().slice(0, 8)}`,
  password = randomUUID();
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();
let pool;
try {
  docker(
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '-p',
    '127.0.0.1::5432',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=message_runtime_test',
    'postgres:17-alpine',
  );
  const port = docker('port', name, '5432/tcp').split(':').at(-1);
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/message_runtime_test?schema=message`;
  pool = new pg.Pool({ connectionString: url });
  for (let i = 0; i < 60; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      await delay(250);
    }
  }
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL_MESSAGE: url,
    DIRECT_URL_MESSAGE: url,
    MESSAGE_TEST_DATABASE_URL: url,
  };
  execFileSync(
    './node_modules/.bin/prisma',
    [
      'migrate',
      'deploy',
      '--config=apps/message-service/prisma/prisma.config.ts',
    ],
    { env, stdio: 'inherit' },
  );
  // Runtime assertions count all rows; run concurrency fixtures afterwards.
  for (const spec of [
    'apps/message-service/test/runtime.spec.ts',
    'apps/message-service/test/lifecycle-concurrency.spec.ts',
  ]) {
    const result = spawnSync('./node_modules/.bin/vitest', ['run', spec], {
      env,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  await pool?.end();
  try {
    docker('rm', '--force', name);
  } catch {
    /* startup failure */
  }
}
