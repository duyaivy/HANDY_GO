import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const suffix = randomUUID().slice(0, 8);
const postgres = `handygo-message-broker-pg-${suffix}`;
const rabbit = `handygo-message-broker-rmq-${suffix}`;
const password = randomUUID();
const owned = [];
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
const port = (name, containerPort) =>
  run('docker', ['port', name, containerPort]).trim().split(':').at(-1);
let exitCode = 0;
try {
  run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    postgres,
    '-p',
    '127.0.0.1::5432',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=handygo_message_disposable',
    'postgres:17-alpine',
  ]);
  owned.push(postgres);
  run('docker', [
    'run',
    '-d',
    '--rm',
    '--name',
    rabbit,
    '-p',
    '127.0.0.1::5672',
    '-e',
    'RABBITMQ_DEFAULT_USER=message_test',
    '-e',
    `RABBITMQ_DEFAULT_PASS=${password}`,
    '-e',
    'RABBITMQ_DEFAULT_VHOST=message_test',
    'rabbitmq:4.2-alpine',
  ]);
  owned.push(rabbit);
  console.log('Disposable PostgreSQL and RabbitMQ containers created');
  for (const [name, args] of [
    [postgres, ['pg_isready', '-U', 'postgres']],
    [rabbit, ['rabbitmq-diagnostics', '-q', 'ping']],
  ]) {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        run('docker', ['exec', name, ...args]);
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!ready) throw new Error('Disposable container did not become ready');
  }
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port(postgres, '5432/tcp')}/handygo_message_disposable?schema=message`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL_MESSAGE: databaseUrl,
    DIRECT_URL_MESSAGE: databaseUrl,
    MESSAGE_TEST_DATABASE_URL: databaseUrl,
    MESSAGE_TEST_RABBITMQ_URL: `amqp://message_test:${password}@127.0.0.1:${port(rabbit, '5672/tcp')}/message_test`,
  };
  for (const [command, args] of [
    [
      './node_modules/.bin/prisma',
      [
        'migrate',
        'deploy',
        '--config=apps/message-service/prisma/prisma.config.ts',
      ],
    ],
    [
      './node_modules/.bin/vitest',
      ['run', 'apps/message-service/test/broker.integration.spec.ts'],
    ],
  ]) {
    const result = spawnSync(command, args, { env, stdio: 'inherit' });
    if (result.error || result.status !== 0)
      throw new Error(`Disposable ${command} check failed`);
  }
} catch (error) {
  console.error(
    error.message === undefined
      ? 'Disposable broker test failed'
      : error.message.replaceAll(password, '[redacted]'),
  );
  exitCode = 1;
} finally {
  for (const name of owned.reverse()) {
    try {
      run('docker', ['rm', '-f', name]);
    } catch {
      console.error('Disposable container cleanup failed');
      exitCode = 1;
    }
  }
}
process.exitCode = exitCode;
