import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/tracking-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TrackingEventsService } from '../src/events/tracking-events.service.js';
import type { PrismaService } from '../src/common/prisma/prisma.service.js';

// Explicit opt-in only. Apply tracking migrations to a dedicated test DB first.
const url = process.env.TRACKING_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL pending inbox durability', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url || 'postgresql://unused' }) });
  const service = () => new TrackingEventsService(db as PrismaService);
  const ids: string[] = [];
  const requests: string[] = [];
  function fixture() {
    const eventId = randomUUID(), orderId = randomUUID(), serviceRequestId = randomUUID();
    ids.push(eventId); requests.push(serviceRequestId);
    return { eventId, orderId, serviceRequestId };
  }
  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => {
    await db.pendingTrackingEvent.deleteMany({ where: { eventId: { in: ids } } });
    await db.trackingFlow.deleteMany({ where: { serviceRequestId: { in: requests } } });
    await db.consumedEvent.deleteMany({ where: { eventId: { in: ids } } });
    await db.$disconnect();
  });

  it('survives service recreation and duplicate delivery without Redis', async () => {
    const f = fixture();
    const envelope = { eventId: f.eventId, eventType: 'order.status.changed', orderId: f.orderId, nextStatus: 'in_progress' };
    await service().recordDomainEvent(envelope);
    await service().recordDomainEvent(envelope); // redelivery after commit, before ACK
    expect(await db.pendingTrackingEvent.count({ where: { eventId: f.eventId } })).toBe(1);
    const createdId = randomUUID(); ids.push(createdId);
    await service().recordDomainEvent({ eventId: createdId, eventType: 'order.created', orderId: f.orderId, serviceRequestId: f.serviceRequestId });
    expect(await db.pendingTrackingEvent.count({ where: { eventId: f.eventId } })).toBe(0);
    const recorded = await db.trackingEvent.findUniqueOrThrow({ where: { eventId: f.eventId } });
    expect(recorded.toStatus).toBe('in_progress');
    await service().recordDomainEvent(envelope);
    expect(await db.trackingEvent.count({ where: { eventId: f.eventId } })).toBe(1);
  });

  it('serializes two replicas and atomically removes pending', async () => {
    const f = fixture();
    const envelope = { eventId: f.eventId, eventType: 'order.status.changed', orderId: f.orderId, nextStatus: 'completed' };
    await Promise.all([service().recordDomainEvent(envelope), service().recordDomainEvent(envelope)]);
    await db.trackingFlow.create({ data: { serviceRequestId: f.serviceRequestId, orderId: f.orderId } });
    await Promise.all([service().flushPendingOrderEvents(f.orderId, f.serviceRequestId), service().flushPendingOrderEvents(f.orderId, f.serviceRequestId)]);
    expect(await db.trackingEvent.count({ where: { eventId: f.eventId } })).toBe(1);
    expect(await db.pendingTrackingEvent.count({ where: { eventId: f.eventId } })).toBe(0);
  });

  it('rolls back consumed state and retains pending on timeline failure, then reconciles', async () => {
    const f = fixture();
    await service().recordDomainEvent({ eventId: f.eventId, eventType: 'order.status.changed', orderId: f.orderId });
    await db.trackingFlow.create({ data: { serviceRequestId: f.serviceRequestId, orderId: f.orderId } });
    const failing = new Proxy(db, { get(target, key) {
      if (key === '$transaction') return (callback: any) => target.$transaction(async tx => callback(new Proxy(tx, {
        get(inner, property) {
          if (property === 'trackingEvent') return { create: async () => { throw new Error('injected before timeline insert'); } };
          return Reflect.get(inner, property);
        },
      })));
      return Reflect.get(target, key);
    } });
    expect((await new TrackingEventsService(failing as PrismaService).flushPendingOrderEvents(f.orderId, f.serviceRequestId)).status).toBe('failed');
    expect(await db.consumedEvent.count({ where: { eventId: f.eventId } })).toBe(0);
    expect(await db.pendingTrackingEvent.count({ where: { eventId: f.eventId } })).toBe(1);
    await db.pendingTrackingEvent.update({ where: { eventId: f.eventId }, data: { nextAttemptAt: new Date(0) } });
    await service().reconcilePendingOrders();
    expect(await db.trackingEvent.count({ where: { eventId: f.eventId } })).toBe(1);
    expect(await db.pendingTrackingEvent.count({ where: { eventId: f.eventId } })).toBe(0);
  });
});
