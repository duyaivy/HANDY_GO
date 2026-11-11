// Runs in the deployed runtime image with candidate ENV, before any live restart.
// Only authentication/connectivity checks: no email, application writes or queue changes.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export async function checkEnv(
  role,
  env = process.env,
  load = (name) => import(name),
  report = console.log,
) {
  // Preserve nonblank credentials; defaults must see blanks as absent.
  env = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      typeof value === 'string' && !value.trim() ? undefined : value,
    ]),
  );
  let probe = 'service endpoint configuration';
  try {
    if (role === 'vps4') {
      probe = 'Message Service configuration';
      const required = [
        'DATABASE_URL_MESSAGE', 'MESSAGE_CURSOR_SECRET', 'INTERNAL_SERVICE_SECRET',
        'JWT_PUBLIC_KEY', 'RABBITMQ_URL', 'BIDDING_SERVICE_URL', 'ORDER_SERVICE_URL',
        'AUTH_SERVICE_URL', 'MEDIA_SERVICE_URL',
      ];
      if (required.some((key) => !env[key]?.trim())) throw new Error('Missing Message Service setting');
      if (env.MESSAGE_CURSOR_SECRET.length < 32 || env.INTERNAL_SERVICE_SECRET.length < 32)
        throw new Error('Invalid Message Service secret');
      const pem = (value) => value.startsWith('base64:')
        ? Buffer.from(value.slice(7), 'base64').toString('utf8') : value.replace(/\\n/g, '\n');
      const publicKey = createPublicKey(pem(env.JWT_PUBLIC_KEY));
      if (publicKey.asymmetricKeyType !== 'rsa') throw new Error('Invalid public key');
      for (const key of ['BIDDING_SERVICE_URL', 'ORDER_SERVICE_URL', 'AUTH_SERVICE_URL', 'MEDIA_SERVICE_URL']) {
        const url = new URL(env[key]);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw new Error('Invalid Message Service endpoint');
      }
      const database = new URL(env.DATABASE_URL_MESSAGE);
      if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.pathname.slice(1))
        throw new Error('Invalid Message Service database URL');
    }
    if (env.NODE_ENV === 'production') {
      const userTrust = new URL(env.USER_TRUST_SERVICE_URL || '');
      if (
        userTrust.protocol !== 'http:' ||
        userTrust.hostname !== '10.77.0.1' ||
        userTrust.port !== '3002' ||
        userTrust.username ||
        userTrust.password ||
        !['', '/', '/api/v1'].includes(userTrust.pathname)
      ) {
        throw new Error(
          'USER_TRUST_SERVICE_URL must target the VPS1 WireGuard address',
        );
      }
    }

    probe = 'JWT key pair';
    if (role === 'vps1') {
      const pem = (value) =>
        value.startsWith('base64:')
          ? Buffer.from(value.slice(7), 'base64').toString('utf8')
          : value.replace(/\\n/g, '\n');
      const privateKey = createPrivateKey(pem(env.JWT_PRIVATE_KEY));
      const publicKey = createPublicKey(pem(env.JWT_PUBLIC_KEY));
      const message = Buffer.from('handygo-env-preflight');
      if (
        privateKey.asymmetricKeyType !== 'rsa' ||
        publicKey.asymmetricKeyType !== 'rsa' ||
        !verify(
          'RSA-SHA256',
          message,
          publicKey,
          sign('RSA-SHA256', message, privateKey),
        )
      ) {
        throw new Error('Invalid signing key pair');
      }
    }

    const overrides = {
      vps1: ['AUTH', 'USER_TRUST', 'NOTIFICATION'],
      vps2: ['ORDER', 'BIDDING', 'MATCHING', 'TRACKING'],
      vps3: ['WALLET', 'CATALOG'],
      vps4: ['MESSAGE'],
    }[role];
    if (!overrides) throw new Error('Unknown host role');
    const { default: pg } = await load('pg');
    const databaseUrls = role === 'vps4'
      ? [env.DATABASE_URL_MESSAGE]
      : [env.DATABASE_URL, ...overrides.map((name) => env[`DATABASE_URL_${name}`]).filter(Boolean)];
    for (const connectionString of new Set(databaseUrls)) {
      probe = 'PostgreSQL authentication';
      const client = new pg.Client({
        connectionString,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
      client.on('error', () => {});
      try {
        await client.connect();
        await client.query('SELECT 1');
      } finally {
        await client.end();
      }
    }

    probe = 'Redis authentication';
    const { default: Redis } = await load('ioredis');
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    redis.on('error', () => {}); // Never let a driver's error printer disclose credentials.
    try {
      await redis.connect();
      if ((await redis.ping()) !== 'PONG')
        throw new Error('Invalid Redis response');
    } finally {
      redis.disconnect();
    }

    probe = 'RabbitMQ authentication';
    const { default: amqp } = await load('amqplib');
    const connection = await amqp.connect(env.RABBITMQ_URL, { timeout: 5000 });
    connection.on('error', () => {});
    await connection.close();

    if (role === 'vps1') {
      probe = 'SMTP authentication';
      const { default: nodemailer } = await load('nodemailer');
      const port = Number(env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: env.SMTP_SECURE === 'true' || port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });
      try {
        await transport.verify();
      } finally {
        transport.close();
      }
    }
    report(`Candidate ENV dependency checks passed for ${role}`);
  } catch {
    // Dependency exceptions can contain URLs, passwords or key material.
    throw new Error(`Candidate ENV rejected: ${probe}`);
  }
}

if (['vps1', 'vps2', 'vps3', 'vps4'].includes(process.argv[1])) {
  const timer = setTimeout(() => {
    console.error('Candidate ENV dependency checks timed out');
    process.exit(1);
  }, 90000);
  try {
    await checkEnv(process.argv[1]);
    clearTimeout(timer);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
