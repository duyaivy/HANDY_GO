import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { checkEnv } from '../env-preflight.mjs';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  JWT_PRIVATE_KEY: `base64:${Buffer.from(keys.privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64')}`,
  JWT_PUBLIC_KEY: `base64:${Buffer.from(keys.publicKey.export({ type: 'spki', format: 'pem' })).toString('base64')}`,
  DATABASE_URL: 'postgresql://fixture:private-value@database/app',
  REDIS_URL: 'rediss://fixture:private-value@redis',
  RABBITMQ_URL: 'amqps://fixture:private-value@broker',
  NODE_ENV: 'production', USER_TRUST_SERVICE_URL: 'http://10.77.0.1:3002',
  SMTP_USER: 'fixture@example.com', SMTP_PASS: 'private-value',
};

function fixture(failing) {
  const calls = [];
  const check = name => {
    calls.push(name);
    if (name === failing) throw new Error(`private-value ${env.DATABASE_URL}`);
  };
  const modules = {
    pg: { Client: class {
      constructor(options) { calls.push(['database', options.connectionString]); }
      on() {}
      async connect() { check('postgres-connect'); }
      async query(sql) { assert.equal(sql, 'SELECT 1'); check('postgres-query'); }
      async end() { calls.push('postgres-close'); }
    } },
    ioredis: class {
      on() {}
      async connect() { check('redis-connect'); }
      async ping() { check('redis-ping'); return 'PONG'; }
      disconnect() { calls.push('redis-close'); }
    },
    amqplib: { async connect() {
      check('rabbit-connect');
      return { on() {}, async close() { calls.push('rabbit-close'); } };
    } },
    nodemailer: { createTransport(options) {
      calls.push(['smtp-options', options]);
      return {
        async verify() { check('smtp-verify'); },
        close() { calls.push('smtp-close'); },
        sendMail() { assert.fail('Preflight must never send mail'); },
      };
    } },
  };
  return { calls, load: async name => ({ default: modules[name] }) };
}

test('valid candidate authenticates dependencies without business writes or email', async () => {
  const { calls, load } = fixture();
  await checkEnv('vps1', env, load, () => {});
  for (const name of ['postgres-query', 'redis-ping', 'rabbit-close', 'smtp-verify', 'smtp-close']) {
    assert.ok(calls.includes(name), name);
  }
});

for (const [failure, expected, closed] of [
  ['postgres-connect', 'PostgreSQL', 'postgres-close'],
  ['postgres-query', 'PostgreSQL', 'postgres-close'],
  ['redis-connect', 'Redis', 'redis-close'],
  ['redis-ping', 'Redis', 'redis-close'],
  ['rabbit-connect', 'RabbitMQ', null],
  ['smtp-verify', 'SMTP', 'smtp-close'],
]) {
  test(`${failure} rejects candidate without disclosing credentials`, async () => {
    const { calls, load } = fixture(failure);
    await assert.rejects(checkEnv('vps1', env, load, () => {}), error => {
      assert.match(error.message, new RegExp(expected));
      assert.ok(!error.message.includes('private-value'));
      assert.ok(!error.message.includes('postgresql:'));
      return true;
    });
    if (closed) assert.ok(calls.includes(closed));
  });
}

test('cross-VPS User Trust calls require the VPS1 WireGuard IP', async () => {
  const { calls, load } = fixture();
  await assert.rejects(checkEnv('vps2', { ...env, USER_TRUST_SERVICE_URL: 'http://user-trust-service:3002' }, load, () => {}), /service endpoint configuration/);
  assert.equal(calls.length, 0);
  await checkEnv('vps2', env, load, () => {});
});

test('mismatched signing keys fail before dependency connections', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { calls, load } = fixture();
  await assert.rejects(checkEnv('vps1', {
    ...env, JWT_PUBLIC_KEY: other.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  }, load, () => {}), /JWT key pair/);
  assert.equal(calls.length, 0);
});

test('host database overrides are checked once and SMTP runs only on VPS1', async () => {
  const { calls, load } = fixture();
  await checkEnv('vps2', {
    ...env, DATABASE_URL_ORDER: 'postgresql://order/app',
    DATABASE_URL_BIDDING: 'postgresql://order/app', DATABASE_URL_WALLET: 'postgresql://wallet/app',
  }, load, () => {});
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'database'), [
    ['database', env.DATABASE_URL], ['database', 'postgresql://order/app'],
  ]);
  assert.ok(!calls.includes('smtp-verify'));
});

for (const blank of [undefined, '', '   ']) {
  test(`blank host overrides and SMTP defaults are unset: ${JSON.stringify(blank)}`, async () => {
    const { calls, load } = fixture();
    await checkEnv('vps1', { ...env, DATABASE_URL_AUTH: blank, DATABASE_URL_USER_TRUST: blank,
      DATABASE_URL_NOTIFICATION: blank, SMTP_HOST: blank, SMTP_PORT: blank }, load, () => {});
    assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'database'), [['database', env.DATABASE_URL]]);
    const options = calls.find(call => Array.isArray(call) && call[0] === 'smtp-options')[1];
    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 465);
  });
}
