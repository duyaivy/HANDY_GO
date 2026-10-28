// Deployment probes; never print connection strings, tokens, or dependency errors.
import { randomUUID } from 'node:crypto';

const service = process.argv[2];
let probe = 'local health';
const timer = setTimeout(() => {
  console.error(`Verification timeout for ${service}: ${probe}`);
  process.exit(1);
}, 25000);
async function http(url, expected = 200, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (response.status !== expected) throw new Error('HTTP probe failed');
  return response;
}
try {
  await http(`http://127.0.0.1:${process.env.PORT}/health`);
  const database = {
    'auth-service': [process.env.DATABASE_URL_AUTH || process.env.DATABASE_URL, 'SELECT count(*) FROM auth_service.roles'],
    'user-trust-service': [process.env.DATABASE_URL_USER_TRUST || process.env.DATABASE_URL, 'SELECT 1 FROM user_trust_service.users LIMIT 1'],
    'catalog-service': [process.env.DATABASE_URL, 'SELECT 1 FROM catalog_service.outbox_events LIMIT 1'],
  }[service];
  if (database) {
    probe = 'database SQL';
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: database[0], connectionTimeoutMillis: 5000, query_timeout: 5000 });
    await client.connect();
    try { await client.query(database[1]); } finally { await client.end(); }
  }
  if (service === 'user-trust-service') {
    probe = 'RabbitMQ User Trust consumer';
    const { default: amqp } = await import('amqplib');
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    try {
      const channel = await connection.createChannel();
      const queue = await channel.checkQueue('user-trust-service');
      if (queue.consumerCount < 1) throw new Error('No User Trust consumer');
      await channel.close();
    } finally { await connection.close(); }
  }
  if (service === 'auth-service') {
    probe = 'Auth to User Trust RPC';
    // Use the Nest RMQ wire contract without loading another Nest application in this cgroup.
    const { default: amqp } = await import('amqplib');
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    try {
      const channel = await connection.createChannel();
      const reply = await channel.assertQueue('', { exclusive: true, autoDelete: true });
      const correlationId = randomUUID();
      let timeoutId;
      try {
        await new Promise(async (resolve, reject) => {
          timeoutId = setTimeout(() => reject(new Error('RPC timeout')), 8000);
          try {
            await channel.consume(reply.queue, message => {
              if (!message || message.properties.correlationId !== correlationId) return;
              try {
                const packet = JSON.parse(message.content.toString());
                if (packet.err) return reject(new Error('RPC failed'));
                if (typeof packet.response?.exists === 'boolean') resolve();
              } catch { reject(new Error('Invalid RPC packet')); }
            }, { noAck: true });
            channel.sendToQueue('user-trust-service', Buffer.from(JSON.stringify({
              pattern: 'user.auth-status', id: correlationId,
              data: { userId: '00000000-0000-4000-8000-000000000000', roles: ['Customer'] },
            })), { replyTo: reply.queue, correlationId });
          } catch (error) { reject(error); }
        });
      } finally { clearTimeout(timeoutId); await channel.close(); }
    } finally { await connection.close(); }
  }
  if (service === 'api-gateway') {
    for (const key of ['AUTH', 'USER_TRUST', 'CATALOG', 'ORDER', 'BIDDING', 'MATCHING', 'PAYMENT', 'NOTIFICATION', 'WALLET', 'TRACKING']) {
      probe = `Gateway to ${key} health`;
      await http(`${process.env[`${key}_SERVICE_URL`]}/health`);
    }
    probe = 'Gateway catalog API';
    const categories = await http('http://127.0.0.1:3000/api/v1/categories');
    const payload = await categories.json();
    if (!payload.data) throw new Error('Invalid catalog envelope');
    probe = 'Gateway rejects forged identity';
    await http('http://127.0.0.1:3000/api/v1/users/me', 401, { 'x-user-id': 'forged' });
  }
  if (service === 'notification-service') {
    const base = `http://127.0.0.1:${process.env.PORT}/${process.env.API_PREFIX || 'api/v1'}/notifications`;
    probe = 'Notification rejects untrusted identity';
    await http(`${base}/unread-count`, 403, { 'x-user-id': randomUUID() });
    const headers = { 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET, 'x-user-id': randomUUID() };
    probe = 'Notification database and unread count';
    const count = await (await http(`${base}/unread-count`, 200, headers)).json();
    if (!Number.isInteger(count.data?.count) || count.data.count < 0) throw new Error('Invalid unread count');
    probe = 'Notification preferences';
    const preferences = await (await http(`${base}/preferences`, 200, headers)).json();
    if (!['pushEnabled', 'inAppEnabled', 'emailEnabled'].every(key => typeof preferences.data?.[key] === 'boolean')) {
      throw new Error('Invalid notification preferences');
    }
  }
  clearTimeout(timer);
  console.log(`Verified ${service}; health-only remains health-only`);
} catch {
  clearTimeout(timer);
  console.error(`Verification failed for ${service}: ${probe}`);
  process.exit(1);
}
