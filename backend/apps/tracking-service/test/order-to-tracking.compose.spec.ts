import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import amqp from 'amqplib';
import { PrismaClient as OrderClient } from '@prisma/order-client';
import { PrismaClient as TrackingClient } from '@prisma/tracking-client';
import { PrismaPg } from '@prisma/adapter-pg';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 30_000 });
const required = process.env.HG64_E2E_REQUIRED === '1';
const orderUrl = process.env.HG64_ORDER_DATABASE_URL;
const trackingUrl = process.env.HG64_TRACKING_DATABASE_URL;
const orderApi = process.env.HG64_ORDER_URL;
const gatewayApi = process.env.HG64_GATEWAY_URL;
const rabbitUrl = process.env.HG64_RABBITMQ_URL;
const privateKeyPath = process.env.HG64_JWT_PRIVATE_KEY_PATH;
const missing = Object.entries({ orderUrl, trackingUrl, orderApi, gatewayApi, rabbitUrl, privateKeyPath })
  .filter(([, value]) => !value).map(([key]) => key);
if (required && missing.length) throw new Error(`HG64 integration environment missing: ${missing.join(', ')}`);

describe.skipIf(!required)('Order outbox → RabbitMQ → Tracking → Gateway', () => {
  const orders = new OrderClient({ adapter: new PrismaPg({ connectionString: orderUrl! }) });
  const tracking = new TrackingClient({ adapter: new PrismaPg({ connectionString: trackingUrl! }) });
  let connection: Awaited<ReturnType<typeof amqp.connect>>;
  let channel: Awaited<ReturnType<typeof connection.createConfirmChannel>>;
  let privateKey: string;

  const waitFor = async <T>(read: () => Promise<T | false>, label: string, timeoutMs = 60_000): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const identity = (userId: string, role: string) => ({
    'x-user-id': userId,
    'x-user-roles': role,
  });

  const requestOrder = async (path: string, method: string, userId: string, role: string, body: object = {}) => {
    const response = await fetch(`${orderApi}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...identity(userId, role) },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(json)}`);
    return json.data;
  };

  const token = (userId: string, role: string) => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const signed = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      sub: randomUUID(), userId, sid: randomUUID(), roles: [role], permissions: [],
      tokenType: 'access', iss: 'handy-go-auth', aud: 'handy-go-api', iat: now, exp: now + 300,
    })}`;
    return `${signed}.${sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64url')}`;
  };

  const gatewayGet = async (path: string, userId: string, role = 'Customer') => {
    const response = await fetch(`${gatewayApi}${path}`, {
      headers: { authorization: `Bearer ${token(userId, role)}` },
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`Gateway ${path}: HTTP ${response.status} ${JSON.stringify(json)}`);
    return json.data;
  };

  const createOrder = async () => {
    const customerId = randomUUID(), workerId = randomUUID();
    const request = await requestOrder('/api/v1/service-requests', 'POST', customerId, 'customer', {
      serviceId: randomUUID(), description: 'HG64 integration repair',
      addressText: '123 Test Street, Da Nang', latitude: 16.0748, longitude: 108.1499,
      scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      aiRefPriceMin: 200000, aiRefPriceMax: 400000,
    });
    await requestOrder(`/api/v1/service-requests/${request.id}/publish`, 'POST', customerId, 'customer');
    const proposal = await requestOrder('/api/v1/booking-proposals', 'POST', customerId, 'customer', {
      serviceRequestId: request.id, workerUserId: workerId,
      selectionSource: 'bid', sourceBidId: randomUUID(),
      agreedPrice: 300000, agreedScope: 'HG64 integration repair',
    });
    const order = await requestOrder(`/api/v1/booking-proposals/${proposal.id}/accept`, 'POST', workerId, 'worker');
    await waitFor(async () => (await tracking.trackingFlow.findUnique({ where: { orderId: order.id } })) || false, 'order.created flow');
    return { customerId, workerId, serviceRequestId: request.id, orderId: order.id };
  };

  const assertTransition = async (orderId: string, previousStatus: string, nextStatus: string) => {
    const rows = await orders.outboxEvent.findMany({ where: { aggregateId: orderId, eventType: 'order.status.changed' } });
    const matches = rows.filter(row => (row.payload as any).previousStatus === previousStatus && (row.payload as any).nextStatus === nextStatus);
    expect(matches).toHaveLength(1);
    const event = matches[0];
    await waitFor(async () => (await orders.outboxEvent.findUnique({ where: { id: event.id } }))?.status === 'published', `${nextStatus} outbox published`);
    await waitFor(async () => (await tracking.trackingEvent.count({ where: { eventId: event.id } })) === 1, `${nextStatus} timeline`);
    expect(await tracking.trackingEvent.count({ where: { eventId: event.id } })).toBe(1);
    expect(await tracking.trackingEvent.findUnique({ where: { eventId: event.id } })).toMatchObject({
      fromStatus: previousStatus, toStatus: nextStatus,
    });
    return event;
  };

  const assertPublishedEvent = async (orderId: string, eventType: string) => {
    const rows = await orders.outboxEvent.findMany({ where: { aggregateId: orderId, eventType } });
    expect(rows).toHaveLength(1);
    const event = rows[0];
    await waitFor(async () => (await orders.outboxEvent.findUnique({ where: { id: event.id } }))?.status === 'published', `${eventType} outbox published`);
    await waitFor(async () => (await tracking.trackingEvent.count({ where: { eventId: event.id } })) === 1, `${eventType} timeline`);
    return event;
  };

  const publish = async (pattern: string, data: object) => {
    channel.publish('handy-go.events', pattern, Buffer.from(JSON.stringify({ pattern, data })), { persistent: true });
    await channel.waitForConfirms();
  };

  beforeAll(async () => {
    privateKey = readFileSync(privateKeyPath!, 'utf8');
    await orders.$connect();
    await tracking.$connect();
    connection = await amqp.connect(rabbitUrl!);
    channel = await connection.createConfirmChannel();
    await waitFor(async () => (await channel.checkQueue('tracking-service')).consumerCount > 0, 'Tracking RabbitMQ consumer');
  });
  afterAll(async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
    await orders.$disconnect();
    await tracking.$disconnect();
  });

  it('carries Order API transitions through the outbox, broker, timeline, summary and Gateway SSE', async () => {
    const f = await createOrder();
    const abort = new AbortController();
    const live = await fetch(`${gatewayApi}/api/v1/tracking/requests/${f.serviceRequestId}/live`, {
      headers: { authorization: `Bearer ${token(f.customerId, 'Customer')}` }, signal: abort.signal,
    });
    expect(live.status).toBe(200);
    expect(live.headers.get('content-type')).toContain('text/event-stream');
    const reader = live.body!.getReader();
    let stream = '';
    const reading = (async () => {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) return;
          stream += new TextDecoder().decode(chunk.value);
        }
      } catch (error) { if (!abort.signal.aborted) throw error; }
    })();
    try {
      await requestOrder(`/api/v1/orders/${f.orderId}/confirm-readiness`, 'POST', f.workerId, 'worker');
      const confirmed = await assertTransition(f.orderId, 'created', 'confirmed');
      const saved = await tracking.trackingEvent.findUniqueOrThrow({ where: { eventId: confirmed.id } });
      await waitFor(async () => stream.includes(`id: ${saved.id}`), 'Gateway SSE confirmation');

      await requestOrder(`/api/v1/orders/${f.orderId}/start`, 'POST', f.workerId, 'worker');
      await assertTransition(f.orderId, 'confirmed', 'in_progress');
      await requestOrder(`/api/v1/orders/${f.orderId}/evidence`, 'POST', f.workerId, 'worker', {
        mediaType: 'image', mediaUrl: 'https://res.cloudinary.com/hg64-test/image/upload/proof.jpg',
      });
      await requestOrder(`/api/v1/orders/${f.orderId}/finish`, 'POST', f.workerId, 'worker');
      await assertTransition(f.orderId, 'in_progress', 'awaiting_customer_confirmation');
      const awaiting = await gatewayGet(`/api/v1/tracking/requests/${f.serviceRequestId}/summary`, f.customerId);
      expect(awaiting.currentPhase).toBe('AWAITING_CONFIRMATION');
      expect(awaiting.order.status).toBe('awaiting_customer_confirmation');

      await requestOrder(`/api/v1/orders/${f.orderId}/confirm-completion`, 'POST', f.customerId, 'customer');
      const completed = await assertPublishedEvent(f.orderId, 'order.completed');
      expect(completed.id).toBeTruthy();
      const summary = await gatewayGet(`/api/v1/tracking/requests/${f.serviceRequestId}/summary`, f.customerId);
      expect(summary.currentPhase).toBe('COMPLETED');
      expect(await orders.outboxEvent.count({ where: { aggregateId: f.orderId, eventType: { in: ['order.confirmed', 'order.started', 'order.finished'] } } })).toBe(0);

      const paymentId = randomUUID();
      await publish('payment.succeeded', { eventId: paymentId, eventType: 'payment.succeeded', orderId: f.orderId, payload: { orderId: f.orderId } });
      await waitFor(async () => (await tracking.trackingEvent.count({ where: { eventId: paymentId } })) === 1, 'payment timeline');
      const paid = await gatewayGet(`/api/v1/tracking/requests/${f.serviceRequestId}/summary`, f.customerId);
      expect(paid.payment.status).toBe('succeeded');

      await publish('order.status.changed', {
        ...confirmed.payload as object, eventId: confirmed.id, eventType: 'order.status.changed',
        payload: confirmed.payload,
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      expect(await tracking.trackingEvent.count({ where: { eventId: confirmed.id } })).toBe(1);
    } finally {
      abort.abort();
      await reading;
    }
  });

  it('tracks rework, dispute and cancellation from real Order API actions', async () => {
    const rework = await createOrder();
    await requestOrder(`/api/v1/orders/${rework.orderId}/confirm-readiness`, 'POST', rework.workerId, 'worker');
    await requestOrder(`/api/v1/orders/${rework.orderId}/start`, 'POST', rework.workerId, 'worker');
    await requestOrder(`/api/v1/orders/${rework.orderId}/evidence`, 'POST', rework.workerId, 'worker', {
      mediaType: 'image', mediaUrl: 'https://res.cloudinary.com/hg64-test/image/upload/rework.jpg',
    });
    await requestOrder(`/api/v1/orders/${rework.orderId}/finish`, 'POST', rework.workerId, 'worker');
    await assertTransition(rework.orderId, 'in_progress', 'awaiting_customer_confirmation');
    await requestOrder(`/api/v1/orders/${rework.orderId}/request-rework`, 'POST', rework.customerId, 'customer', { reason: 'Repair still leaks' });
    await assertTransition(rework.orderId, 'awaiting_customer_confirmation', 'in_progress');
    expect((await gatewayGet(`/api/v1/tracking/requests/${rework.serviceRequestId}/summary`, rework.customerId)).currentPhase).toBe('ORDER_IN_PROGRESS');

    const dispute = await createOrder();
    await requestOrder(`/api/v1/orders/${dispute.orderId}/confirm-readiness`, 'POST', dispute.workerId, 'worker');
    await requestOrder(`/api/v1/orders/${dispute.orderId}/start`, 'POST', dispute.workerId, 'worker');
    await requestOrder(`/api/v1/orders/${dispute.orderId}/dispute`, 'POST', dispute.customerId, 'customer', { reason: 'Work caused additional damage' });
    await assertTransition(dispute.orderId, 'in_progress', 'disputed');
    expect((await gatewayGet(`/api/v1/tracking/requests/${dispute.serviceRequestId}/summary`, dispute.customerId)).currentPhase).toBe('DISPUTED');

    const cancelled = await createOrder();
    await requestOrder(`/api/v1/orders/${cancelled.orderId}/cancel`, 'POST', cancelled.customerId, 'customer', { reason: 'Schedule changed' });
    await assertPublishedEvent(cancelled.orderId, 'order.cancelled');
    expect((await gatewayGet(`/api/v1/tracking/requests/${cancelled.serviceRequestId}/summary`, cancelled.customerId)).currentPhase).toBe('CANCELLED');
  });

  it('buffers an Order status event delivered before order.created and flushes once', async () => {
    const orderId = randomUUID(), serviceRequestId = randomUUID(), pendingId = randomUUID(), createdId = randomUUID();
    await publish('order.status.changed', { eventId: pendingId, eventType: 'order.status.changed', orderId, payload: { orderId, previousStatus: 'created', nextStatus: 'confirmed' } });
    await waitFor(async () => (await tracking.pendingTrackingEvent.count({ where: { eventId: pendingId } })) === 1, 'pending Order event');
    await publish('order.created', { eventId: createdId, eventType: 'order.created', orderId, serviceRequestId });
    await waitFor(async () => (await tracking.trackingEvent.count({ where: { eventId: pendingId } })) === 1, 'flushed Order event');
    expect(await tracking.pendingTrackingEvent.count({ where: { eventId: pendingId } })).toBe(0);
    expect(await tracking.trackingEvent.count({ where: { eventId: pendingId } })).toBe(1);
  });
});
