import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/tracking-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TrackingEventsService } from '../src/events/tracking-events.service.js';
import { TrackingEventsConsumer } from '../src/events/tracking-events.consumer.js';
import { TimelineStreamService } from '../src/common/stream/timeline-stream.service.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';
import type { RedisService } from '@app/redis';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const databaseUrl = process.env.TRACKING_TEST_DATABASE_URL;
const rabbitUrl = process.env.TRACKING_TEST_RABBITMQ_URL;
const redisUrl = process.env.TRACKING_TEST_REDIS_URL;
describe.skipIf(!databaseUrl || !rabbitUrl || !redisUrl)('real RabbitMQ and Redis SSE transport', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl || 'postgresql://unused' }) });
  const ids: string[] = [], requests: string[] = [];
  let connection: Awaited<ReturnType<typeof amqp.connect>>;
  let channel: Awaited<ReturnType<typeof connection.createConfirmChannel>>;
  let exchange: string;
  const redisPublisher = new Redis(redisUrl || 'redis://localhost', { lazyConnect: true });
  const subscriptions: Redis[] = [];
  const redisAdapter = {
    async publishStrict(topic: string, payload: unknown) { return redisPublisher.publish(topic, JSON.stringify(payload)); },
    async subscribe(topic: string, callback: (value: string) => void, onReconnect?: () => void) {
      const sub = new Redis(redisUrl || 'redis://localhost', { lazyConnect: true });
      subscriptions.push(sub);
      await sub.connect();
      sub.on('message', (name, value) => { if (name === topic) callback(value); });
      if (onReconnect) sub.on('ready', onReconnect);
      await sub.subscribe(topic);
      return async () => { await sub.unsubscribe(topic); await sub.quit(); };
    },
    async delByPattern() { /* cache is not part of this transport test */ },
  } as unknown as RedisService;
  const prisma = db as PrismaService;
  const waitFor = async (condition: () => Promise<boolean>, timeoutMs = 25_000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { if (await condition()) return; await new Promise(r => setTimeout(r, 250)); }
    throw new Error('Timed out waiting for transport result');
  };
  beforeAll(async () => {
    await db.$connect(); await redisPublisher.connect();
    connection = await amqp.connect(rabbitUrl!);
    channel = await connection.createConfirmChannel();
    exchange = `tracking-inbox-test-${randomUUID()}`;
    await channel.assertExchange(exchange, 'topic', { durable: false, autoDelete: false });
  });
  afterAll(async () => {
    if (channel) { await channel.deleteExchange(exchange).catch(() => {}); await channel.close().catch(() => {}); }
    if (connection) await connection.close().catch(() => {});
    await redisPublisher.quit().catch(() => {});
    await db.pendingTrackingEvent.deleteMany({ where: { eventId: { in: ids } } });
    await db.trackingFlow.deleteMany({ where: { serviceRequestId: { in: requests } } });
    await db.consumedEvent.deleteMany({ where: { eventId: { in: ids } } });
    await db.$disconnect();
  });
  const fixture = () => {
    const orderId = randomUUID(), serviceRequestId = randomUUID(); requests.push(serviceRequestId);
    return { orderId, serviceRequestId, eventId: () => { const id = randomUUID(); ids.push(id); return id; } };
  };
  async function deliver(topic: string, envelope: object, handler: (data: any, context: any) => Promise<void>) {
    const queue = await channel.assertQueue('', { exclusive: true, autoDelete: true });
    await channel.bindQueue(queue.queue, exchange, topic);
    let done!: (result: 'ack' | 'nack') => void;
    const settled = new Promise<'ack' | 'nack'>(resolve => { done = resolve; });
    const consumer = await channel.consume(queue.queue, msg => {
      if (!msg) return;
      const context = { getMessage: () => msg, getChannelRef: () => ({
        ack: () => { channel.ack(msg); done('ack'); },
        nack: () => { channel.nack(msg, false, false); done('nack'); },
      }) };
      void handler(JSON.parse(msg.content.toString()), context).catch(() => done('nack'));
    }, { noAck: false });
    channel.publish(exchange, topic, Buffer.from(JSON.stringify(envelope)));
    await channel.waitForConfirms();
    const result = await Promise.race([settled, new Promise<'nack'>((_, reject) => setTimeout(() => reject(new Error('Rabbit delivery timed out')), 25_000))]);
    await channel.cancel(consumer.consumerTag);
    await channel.deleteQueue(queue.queue);
    return result;
  }

  it('Rabbit ACK follows PostgreSQL pending commit; mapping drains exactly once after redelivery', async () => {
    const f = fixture(); const service = new TrackingEventsService(prisma); const consumer = new TrackingEventsConsumer(service);
    const pending = { eventId: f.eventId(), orderId: f.orderId, eventType: 'order.status.changed', payload: { orderId: f.orderId, nextStatus: 'in_progress' } };
    const handle = (data: any, ctx: any) => consumer.handleOrderStatusChanged(data, ctx);
    expect(await deliver('order.status.changed', pending, handle)).toBe('ack');
    expect(await db.pendingTrackingEvent.count({ where: { eventId: pending.eventId } })).toBe(1);
    expect(await deliver('order.status.changed', pending, handle)).toBe('ack');
    expect(await db.pendingTrackingEvent.count({ where: { eventId: pending.eventId } })).toBe(1);
    const created = { eventId: f.eventId(), orderId: f.orderId, serviceRequestId: f.serviceRequestId, eventType: 'order.created' };
    expect(await deliver('order.created', created, (data, ctx) => consumer.handleOrderCreated(data, ctx))).toBe('ack');
    await waitFor(async () => (await db.trackingEvent.count({ where: { eventId: pending.eventId } })) === 1);
    expect(await db.pendingTrackingEvent.count({ where: { eventId: pending.eventId } })).toBe(0);
  });

  it('Rabbit redelivers after the consumer channel closes between pending commit and ACK', async () => {
    const f = fixture(); const service = new TrackingEventsService(prisma); const consumer = new TrackingEventsConsumer(service);
    const pending = { eventId: f.eventId(), orderId: f.orderId, eventType: 'order.status.changed', payload: { orderId: f.orderId, nextStatus: 'in_progress' } };
    const queue = await channel.assertQueue('', { exclusive: true, autoDelete: false });
    const crashChannel = await connection.createChannel();
    try {
      await channel.bindQueue(queue.queue, exchange, 'order.status.changed');
      let finish!: (error?: Error) => void;
      const committed = new Promise<void>((resolve, reject) => { finish = error => error ? reject(error) : resolve(); });
      await crashChannel.consume(queue.queue, msg => {
        if (!msg) return;
        void service.recordDomainEvent(JSON.parse(msg.content.toString())).then(async () => {
          await crashChannel.close(); // RabbitMQ has not received an ACK for this delivery.
          finish();
        }).catch(error => finish(error));
      }, { noAck: false });
      channel.publish(exchange, 'order.status.changed', Buffer.from(JSON.stringify(pending)));
      await channel.waitForConfirms();
      await committed;
      expect(await db.pendingTrackingEvent.count({ where: { eventId: pending.eventId } })).toBe(1);

      let redelivered: amqp.GetMessage | false = false;
      await waitFor(async () => {
        redelivered = await channel.get(queue.queue, { noAck: false });
        return Boolean(redelivered);
      });
      expect(redelivered).not.toBe(false);
      expect((redelivered as amqp.GetMessage).fields.redelivered).toBe(true);
      const message = redelivered as amqp.GetMessage;
      await consumer.handleOrderStatusChanged(JSON.parse(message.content.toString()), {
        getMessage: () => message,
        getChannelRef: () => ({ ack: () => channel.ack(message), nack: () => channel.nack(message, false, false) }),
      } as any);
      expect(await db.pendingTrackingEvent.count({ where: { eventId: pending.eventId } })).toBe(1);

      const created = { eventId: f.eventId(), orderId: f.orderId, serviceRequestId: f.serviceRequestId, eventType: 'order.created' };
      expect(await deliver('order.created', created, (data, ctx) => consumer.handleOrderCreated(data, ctx))).toBe('ack');
      await waitFor(async () => (await db.trackingEvent.count({ where: { eventId: pending.eventId } })) === 1);
      expect(await db.pendingTrackingEvent.count({ where: { eventId: pending.eventId } })).toBe(0);
    } finally {
      await crashChannel.close().catch(() => {});
      await channel.deleteQueue(queue.queue).catch(() => {});
    }
  });

  it('replica B receives Redis signal from A; missed signal is recovered from PostgreSQL', async () => {
    const f = fixture(); const customerId = randomUUID();
    await new TrackingEventsService(prisma).recordDomainEvent({ eventId: f.eventId(), eventType: 'service_request.created', serviceRequestId: f.serviceRequestId, customerId });
    const replicaA = new TimelineStreamService(prisma, redisAdapter);
    const replicaB = new TimelineStreamService(prisma, redisAdapter);
    await replicaA.onModuleInit(); await replicaB.onModuleInit();
    const received: string[] = [];
    const user = { userId: customerId, isCustomer: true, isWorker: false, isAdmin: false, roles: ['Customer'] } as any;
    const observable = await replicaB.getLiveStream(f.serviceRequestId, user);
    const subscription = observable.subscribe(event => { if (event.type === 'timeline_event') received.push(event.id!); });
    try {
      const serviceA = new TrackingEventsService(prisma, undefined, replicaA);
      const eventId = f.eventId();
      await serviceA.recordDomainEvent({ eventId, eventType: 'service_request.published', serviceRequestId: f.serviceRequestId, customerId });
      const saved = await db.trackingEvent.findUniqueOrThrow({ where: { eventId } });
      await waitFor(async () => received.includes(saved.id));
      expect(received.filter(id => id === saved.id)).toHaveLength(1);
      // Simulate a lost Pub/Sub signal: commit without broadcasting, keep replica B stream open.
      const missedId = f.eventId();
      await new TrackingEventsService(prisma).recordDomainEvent({ eventId: missedId, eventType: 'service_request.bidding_closed', serviceRequestId: f.serviceRequestId, customerId });
      const missed = await db.trackingEvent.findUniqueOrThrow({ where: { eventId: missedId } });
      await waitFor(async () => received.includes(missed.id), 20_000);
      expect(received.filter(id => id === missed.id)).toHaveLength(1);
    } finally { subscription.unsubscribe(); await replicaA.onModuleDestroy(); await replicaB.onModuleDestroy(); }
  });
});
