import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';
import { PrismaClient } from '@prisma/tracking-client';
import { PrismaPg } from '@prisma/adapter-pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });
const databaseUrl = process.env.TRACKING_TEST_DATABASE_URL;
const rabbitUrl = process.env.TRACKING_TEST_RABBITMQ_URL;
const serviceUrl = process.env.TRACKING_TEST_SERVICE_URL;
const gatewaySecret = process.env.TRACKING_TEST_INTERNAL_SECRET;

describe.skipIf(!databaseUrl || !rabbitUrl || !serviceUrl || !gatewaySecret)('running Compose tracking service', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl || 'postgresql://unused' }) });
  const requests: string[] = [], eventIds: string[] = [];
  let connection: Awaited<ReturnType<typeof amqp.connect>>;
  let channel: Awaited<ReturnType<typeof connection.createConfirmChannel>>;
  const fixture = () => ({
    serviceRequestId: (() => { const id = randomUUID(); requests.push(id); return id; })(),
    eventId: () => { const id = randomUUID(); eventIds.push(id); return id; },
  });
  const waitFor = async (condition: () => Promise<boolean>, timeoutMs = 25_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await condition()) return;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    throw new Error('Timed out waiting for running tracking service');
  };
  const publish = async (pattern: string, data: object) => {
    channel.publish('handy-go.events', pattern, Buffer.from(JSON.stringify({ pattern, data })), { persistent: true });
    await channel.waitForConfirms();
  };
  beforeAll(async () => {
    await db.$connect();
    connection = await amqp.connect(rabbitUrl!);
    channel = await connection.createConfirmChannel();
    const queue = await channel.checkQueue('tracking-service');
    expect(queue.consumerCount).toBeGreaterThan(0);
  });
  afterAll(async () => {
    if (channel) await channel.close().catch(() => {});
    if (connection) await connection.close().catch(() => {});
    await db.pendingTrackingEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await db.trackingFlow.deleteMany({ where: { serviceRequestId: { in: requests } } });
    await db.consumedEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await db.$disconnect();
  });

  it('consumes an out-of-order order event from the Compose exchange and flushes it once', async () => {
    const f = fixture(), orderId = randomUUID();
    const pendingId = f.eventId(), createdId = f.eventId();
    await publish('order.status.changed', { eventId: pendingId, eventType: 'order.status.changed', orderId, payload: { orderId, nextStatus: 'in_progress' } });
    await waitFor(async () => (await db.pendingTrackingEvent.count({ where: { eventId: pendingId } })) === 1);
    expect((await channel.checkQueue('tracking-service')).messageCount).toBe(0);
    await publish('order.created', { eventId: createdId, eventType: 'order.created', orderId, serviceRequestId: f.serviceRequestId });
    await waitFor(async () => (await db.trackingEvent.count({ where: { eventId: pendingId } })) === 1);
    expect(await db.pendingTrackingEvent.count({ where: { eventId: pendingId } })).toBe(0);
  });

  it('records the Order bidding-close event once and reports closure without a round-close event', async () => {
    const f = fixture(), customerId = randomUUID();
    const publishedId = f.eventId(), openedId = f.eventId(), closedId = f.eventId();
    const biddingClosedAt = new Date().toISOString();
    await publish('service_request.published', {
      eventId: publishedId, eventType: 'service_request.published',
      serviceRequestId: f.serviceRequestId, customerUserId: customerId,
    });
    await waitFor(async () => (await db.trackingEvent.count({ where: { eventId: publishedId } })) === 1);
    await publish('bidding.round.opened', {
      eventId: openedId, eventType: 'bidding.round.opened',
      serviceRequestId: f.serviceRequestId, roundId: randomUUID(),
    });
    await waitFor(async () => (await db.trackingEvent.count({ where: { eventId: openedId } })) === 1);
    const closePayload = {
      eventId: closedId, eventType: 'service_request.bidding_closed',
      serviceRequestId: f.serviceRequestId, customerUserId: customerId,
      biddingClosedAt,
    };
    await publish('service_request.bidding_closed', closePayload);
    await publish('service_request.bidding_closed', closePayload);
    await waitFor(async () => (await db.trackingEvent.count({ where: { eventId: closedId } })) === 1);
    expect(await db.trackingEvent.count({ where: { eventId: closedId } })).toBe(1);

    const headers = { 'x-internal-secret': gatewaySecret!, 'x-user-id': customerId, 'x-user-roles': 'Customer' };
    const summaryResponse = await fetch(`${serviceUrl}/api/v1/tracking/requests/${f.serviceRequestId}/summary`, { headers });
    expect(summaryResponse.status).toBe(200);
    const summary = (await summaryResponse.json()).data;
    expect(summary.serviceRequest.status).toBe('bidding_closed');
    expect(summary.serviceRequest.biddingClosedAt).toBe(biddingClosedAt);
    expect(summary.currentPhase).toBe('BIDDING_CLOSED');
    expect(summary.bidding.status).toBe('open');

    const timelineResponse = await fetch(`${serviceUrl}/api/v1/tracking/requests/${f.serviceRequestId}/timeline`, { headers });
    expect(timelineResponse.status).toBe(200);
    const timeline = (await timelineResponse.json()).data;
    expect(timeline.items.filter((event: { eventId: string }) => event.eventId === closedId)).toHaveLength(1);
  });

  it('streams an event over the running Compose HTTP SSE endpoint', async () => {
    const f = fixture(), customerId = randomUUID();
    await publish('service_request.created', { eventId: f.eventId(), eventType: 'service_request.created', serviceRequestId: f.serviceRequestId, customerId });
    await waitFor(async () => (await db.trackingFlow.count({ where: { serviceRequestId: f.serviceRequestId } })) === 1);
    const controller = new AbortController();
    const response = await fetch(`${serviceUrl}/api/v1/tracking/requests/${f.serviceRequestId}/live`, {
      headers: { 'x-internal-secret': gatewaySecret!, 'x-user-id': customerId, 'x-user-roles': 'Customer' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    let content = '';
    const reading = (async () => {
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          content += new TextDecoder().decode(result.value);
        }
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    })();
    try {
      const eventId = f.eventId();
      await publish('service_request.published', { eventId, eventType: 'service_request.published', serviceRequestId: f.serviceRequestId, customerId });
      await waitFor(async () => (await db.trackingEvent.count({ where: { eventId } })) === 1);
      const saved = await db.trackingEvent.findUniqueOrThrow({ where: { eventId } });
      await waitFor(async () => content.includes(saved.id));
      expect(content.split(/\r?\n/).filter(line => line === `id: ${saved.id}`)).toHaveLength(1);
    } finally {
      controller.abort();
      await reading;
    }
  });
});
