// Runs in the deployed runtime image with candidate ENV, before any live restart.
// Only authentication/connectivity checks: no email, application writes or queue changes.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export async function checkEnv(role, env = process.env, load = name => import(name), report = console.log) {
  let probe = 'JWT key pair';
  try {
    if (role === 'vps1') {
      const pem = value => value.startsWith('base64:')
        ? Buffer.from(value.slice(7), 'base64').toString('utf8') : value.replace(/\\n/g, '\n');
      const privateKey = createPrivateKey(pem(env.JWT_PRIVATE_KEY));
      const publicKey = createPublicKey(pem(env.JWT_PUBLIC_KEY));
      const message = Buffer.from('handygo-env-preflight');
      if (privateKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyType !== 'rsa'
          || !verify('RSA-SHA256', message, publicKey, sign('RSA-SHA256', message, privateKey))) {
        throw new Error('Invalid signing key pair');
      }
    }

    const overrides = {
      vps1: ['AUTH', 'USER_TRUST', 'NOTIFICATION'],
      vps2: ['ORDER', 'BIDDING', 'MATCHING'],
      vps3: ['WALLET'],
    }[role];
    if (!overrides) throw new Error('Unknown host role');
    const { default: pg } = await load('pg');
    for (const connectionString of new Set([env.DATABASE_URL,
      ...overrides.map(name => env[`DATABASE_URL_${name}`]).filter(Boolean)])) {
      probe = 'PostgreSQL authentication';
      const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 });
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
      lazyConnect: true, connectTimeout: 5000, maxRetriesPerRequest: 0, retryStrategy: () => null,
    });
    redis.on('error', () => {}); // Never let a driver's error printer disclose credentials.
    try {
      await redis.connect();
      if (await redis.ping() !== 'PONG') throw new Error('Invalid Redis response');
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
        host: env.SMTP_HOST || 'smtp.gmail.com', port,
        secure: env.SMTP_SECURE === 'true' || port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 5000,
      });
      try { await transport.verify(); } finally { transport.close(); }
    }
    report(`Candidate ENV dependency checks passed for ${role}`);
  } catch {
    // Dependency exceptions can contain URLs, passwords or key material.
    throw new Error(`Candidate ENV rejected: ${probe}`);
  }
}

if (['vps1', 'vps2', 'vps3'].includes(process.argv[1])) {
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
