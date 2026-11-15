// Self-contained destructive checks: owns and removes only its disposable container.
// Never reads .env or accepts a database URL.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

const red = process.argv.includes('--red');
const name = `handygo-message-test-${randomUUID().slice(0, 8)}`;
const password = randomUUID();
const database = 'handygo_message_disposable';
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();
let pool;
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log(`PASS ${name}`);
}
async function rejectsSql(sql, params, code) {
  await assert.rejects(pool.query(sql, params), (error) => error.code === code);
}
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
    `POSTGRES_DB=${database}`,
    'postgres:17-alpine',
  );
  const port = docker('port', name, '5432/tcp').split(':').at(-1);
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}?schema=message`;
  pool = new pg.Pool({ connectionString: url, max: 12 });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      await pool.query('SELECT 1');
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert.ok(ready, 'disposable PostgreSQL became ready');
  const customer = randomUUID(),
    worker = randomUUID(),
    stranger = randomUUID();
  const request = randomUUID(),
    conversation = randomUUID(),
    other = randomUUID();
  const createConversation =
    'INSERT INTO message.conversations (id,request_id,customer_id,worker_id,updated_at) VALUES ($1,$2,$3,$4,now())';
  if (red) {
    // A deliberately unconstrained test-only baseline proves the uniqueness assertion catches absence of the migration.
    await pool.query(
      'CREATE SCHEMA message; CREATE TABLE message.conversations (id uuid, request_id uuid, customer_id uuid, worker_id uuid, updated_at timestamptz)',
    );
  } else {
    const args = [
      'migrate',
      'deploy',
      '--config=apps/message-service/prisma/prisma.config.ts',
    ];
    for (let i = 0; i < 2; i++) {
      console.log(
        execFileSync('./node_modules/.bin/prisma', args, {
          cwd: new URL('..', import.meta.url),
          env: {
            ...process.env,
            DATABASE_URL_MESSAGE: url,
            DIRECT_URL_MESSAGE: url,
          },
          encoding: 'utf8',
        }),
      );
    }
  }
  await pool.query(createConversation, [
    conversation,
    request,
    customer,
    worker,
  ]);
  await test('duplicate conversation identity rejected', () =>
    rejectsSql(
      createConversation,
      [randomUUID(), request, customer, worker],
      '23505',
    ));
  await test('identical participants rejected', () =>
    rejectsSql(
      createConversation,
      [randomUUID(), randomUUID(), customer, customer],
      '23514',
    ));
  await pool.query(createConversation, [other, randomUUID(), customer, worker]);
  const insertMessage =
    'INSERT INTO message.messages (id,conversation_id,sender_id,client_message_id,message_type,content,reply_to_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,sequence';
  const m1 = randomUUID(),
    key = randomUUID();
  const first = await pool.query(insertMessage, [
    m1,
    conversation,
    customer,
    key,
    'TEXT',
    'hello',
    null,
  ]);
  assert.equal(first.rows[0].sequence, '1');
  await test('duplicate sender idempotency key rejected', () =>
    rejectsSql(
      insertMessage,
      [randomUUID(), conversation, customer, key, 'TEXT', 'hello', null],
      '23505',
    ));
  await test('idempotency key remains unique across conversations', () =>
    rejectsSql(
      insertMessage,
      [randomUUID(), other, customer, key, 'TEXT', 'hello', null],
      '23505',
    ));
  await test('outsider sender rejected', () =>
    rejectsSql(
      insertMessage,
      [randomUUID(), conversation, stranger, randomUUID(), 'TEXT', 'bad', null],
      '23514',
    ));
  await test('cross-conversation reply rejected', () =>
    rejectsSql(
      insertMessage,
      [randomUUID(), other, worker, randomUUID(), 'TEXT', 'reply', m1],
      '23503',
    ));
  await test('nonexistent reply rejected', () =>
    rejectsSql(
      insertMessage,
      [
        randomUUID(),
        conversation,
        worker,
        randomUUID(),
        'TEXT',
        'reply',
        randomUUID(),
      ],
      '23503',
    ));
  await test('empty text rejected', () =>
    rejectsSql(
      insertMessage,
      [randomUUID(), conversation, customer, randomUUID(), 'TEXT', ' ', null],
      '23514',
    ));
  await test('media message without attachment rejected at commit', () =>
    rejectsSql(
      insertMessage,
      [randomUUID(), conversation, customer, randomUUID(), 'IMAGE', null, null],
      '23514',
    ));
  await test('concurrent sends allocate unique contiguous sequence', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        pool.query(insertMessage, [
          randomUUID(),
          conversation,
          customer,
          randomUUID(),
          'TEXT',
          'parallel',
          null,
        ]),
      ),
    );
    assert.deepEqual(
      results.map((r) => Number(r.rows[0].sequence)).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i + 2),
    );
  });
  await test('concurrent duplicate sends persist once and rollback allocation', async () => {
    const duplicate = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        pool.query(insertMessage, [
          randomUUID(),
          conversation,
          worker,
          duplicate,
          'TEXT',
          'retry',
          null,
        ]),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (
        await pool.query(
          'SELECT last_sequence FROM message.conversations WHERE id=$1',
          [conversation],
        )
      ).rows[0].last_sequence,
      '22',
    );
  });
  const readSql =
    'INSERT INTO message.conversation_read_states (conversation_id,user_id,last_read_sequence,updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (conversation_id,user_id) DO UPDATE SET last_read_sequence=EXCLUDED.last_read_sequence,updated_at=now()';
  await test('read cursor monotonic under stale writes', async () => {
    await pool.query(readSql, [conversation, customer, '20']);
    await pool.query(readSql, [conversation, customer, '2']);
    assert.equal(
      (
        await pool.query(
          'SELECT last_read_sequence FROM message.conversation_read_states WHERE conversation_id=$1 AND user_id=$2',
          [conversation, customer],
        )
      ).rows[0].last_read_sequence,
      '20',
    );
  });
  await test('outsider read state rejected', () =>
    rejectsSql(readSql, [conversation, stranger, '1'], '23514'));
  await test('read cursor beyond history rejected', () =>
    rejectsSql(readSql, [conversation, worker, '999'], '23514'));
  await test('conversation cannot transfer participants', () =>
    rejectsSql(
      'UPDATE message.conversations SET worker_id=$2 WHERE id=$1',
      [conversation, stranger],
      '23514',
    ));
  await test('read state identity immutable', () =>
    rejectsSql(
      'UPDATE message.conversation_read_states SET user_id=$2 WHERE conversation_id=$1',
      [conversation, worker],
      '23514',
    ));
  await test('history and reply targets cannot be edited', () =>
    rejectsSql(
      'UPDATE message.messages SET content=$2 WHERE id=$1',
      [m1, 'changed'],
      '23514',
    ));
  const attachmentSql =
    'INSERT INTO message.message_attachments (id,message_id,storage_key,media_type,mime_type,size_bytes,position) VALUES ($1,$2,$3,$4,$5,$6,$7)';
  await test('attachment cannot reference missing message', () =>
    rejectsSql(
      attachmentSql,
      [
        randomUUID(),
        randomUUID(),
        'verified/key',
        'IMAGE',
        'image/jpeg',
        '10',
        0,
      ],
      '23503',
    ));
  await test('media transaction with verified reference persists', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      await client.query(insertMessage, [
        id,
        conversation,
        customer,
        randomUUID(),
        'IMAGE',
        null,
        null,
      ]);
      await client.query(attachmentSql, [
        randomUUID(),
        id,
        'provider/verified-image',
        'IMAGE',
        'image/jpeg',
        '100',
        0,
      ]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
  await test('invalid metadata and type mismatch rejected', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      await client.query(insertMessage, [
        id,
        conversation,
        customer,
        randomUUID(),
        'IMAGE',
        null,
        null,
      ]);
      await assert.rejects(
        client.query(attachmentSql, [
          randomUUID(),
          id,
          '',
          'IMAGE',
          'video/mp4',
          '-1',
          0,
        ]),
        (e) => e.code === '23514',
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
  await test('message counter cannot be forged directly', () =>
    rejectsSql(
      'UPDATE message.conversations SET last_sequence=999 WHERE id=$1',
      [conversation],
      '23514',
    ));
  await test('large allowed video with provider MIME persists', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      await client.query(insertMessage, [
        id,
        conversation,
        customer,
        randomUUID(),
        'VIDEO',
        'caption',
        null,
      ]);
      await client.query(attachmentSql, [
        randomUUID(),
        id,
        'provider/video',
        'VIDEO',
        'video/quicktime',
        '83886080',
        0,
      ]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
  await test('deletion restricted while history exists', () =>
    rejectsSql(
      'DELETE FROM message.conversations WHERE id=$1',
      [conversation],
      '23503',
    ));
  await test('migration history isolated in message schema', async () => {
    assert.equal(
      (
        await pool.query(
          'SELECT count(*) FROM message._prisma_migrations WHERE finished_at IS NOT NULL',
        )
      ).rows[0].count,
      '2',
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*) FROM information_schema.tables WHERE table_name='_prisma_migrations' AND table_schema<>'message'",
        )
      ).rows[0].count,
      '0',
    );
  });
  await test('initial message counter cannot be forged', () =>
    rejectsSql(
      'INSERT INTO message.conversations (id,request_id,customer_id,worker_id,last_sequence,updated_at) VALUES ($1,$2,$3,$4,100,now())',
      [randomUUID(), randomUUID(), customer, worker],
      '23514',
    ));
  await test('Prisma structural diff is empty after migration', async () => {
    const output = execFileSync(
      './node_modules/.bin/prisma',
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema=apps/message-service/prisma/schema.prisma',
        '--exit-code',
        '--config=apps/message-service/prisma/prisma.config.ts',
      ],
      {
        cwd: new URL('..', import.meta.url),
        env: {
          ...process.env,
          DATABASE_URL_MESSAGE: url,
          DIRECT_URL_MESSAGE: url,
        },
        encoding: 'utf8',
      },
    );
    assert.match(output, /No difference detected/);
  });
  await test('runtime role can persist only inside message schema', async () => {
    await pool.query(
      `CREATE SCHEMA other_service; CREATE TABLE other_service.sentinel (id integer); CREATE ROLE message_runtime; GRANT USAGE ON SCHEMA message TO message_runtime; GRANT SELECT,INSERT,UPDATE ON message.conversations TO message_runtime; GRANT SELECT,INSERT ON message.messages,message.message_attachments TO message_runtime; GRANT SELECT,INSERT,UPDATE ON message.conversation_read_states TO message_runtime`,
    );
    const client = await pool.connect();
    try {
      await client.query('SET ROLE message_runtime');
      await client.query(insertMessage, [
        randomUUID(),
        conversation,
        customer,
        randomUUID(),
        'TEXT',
        'runtime',
        null,
      ]);
      await assert.rejects(
        client.query('SELECT * FROM other_service.sentinel'),
        (e) => e.code === '42501',
      );
      await assert.rejects(
        client.query('CREATE TABLE message.forbidden (id integer)'),
        (e) => e.code === '42501',
      );
      await assert.rejects(
        client.query('CREATE TABLE public.forbidden (id integer)'),
        (e) => e.code === '42501',
      );
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });
  console.log(
    `PASS ${count} database checks; migration deploy applied then repeated safely`,
  );
} finally {
  await pool?.end();
  try {
    docker('rm', '--force', name);
  } catch {
    /* startup may have failed */
  }
}
