import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TrackingEntityType } from '@prisma/tracking-client';
import { TrackingEventsService } from './tracking-events.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

describe('TrackingEventsService', () => {
  let service: TrackingEventsService;
  let prismaMock: any;

  const createRedisMock = (overrides?: any) => ({
    appendListItem: vi.fn(),
    peekListHead: vi.fn(),
    acknowledgeListHead: vi.fn(),
    getListLength: vi.fn().mockResolvedValue(0),
    addToSortedSet: vi.fn(),
    removeFromSortedSet: vi.fn(),
    getSortedSetRangeWithScores: vi.fn().mockResolvedValue([]),
    withDistributedLock: vi.fn(async (_key, callback) => callback(() => true, 'test-lock-token')),
    delByPattern: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      consumedEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      trackingFlow: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn().mockResolvedValue({ eventSequence: 1 }),
      },
      trackingEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(prismaMock)),
    };

    service = new TrackingEventsService(prismaMock as unknown as PrismaService);
  });

  describe('Idempotency & Deduplication', () => {
    it('should skip processing if eventId was already consumed in consumed_events', async () => {
      const eventId = randomUUID();
      prismaMock.consumedEvent.findUnique.mockResolvedValue({
        eventId,
        eventType: 'service_request.created',
        consumedAt: new Date(),
      });

      const result = await service.recordDomainEvent({
        eventId,
        eventType: 'service_request.created',
        serviceRequestId: randomUUID(),
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('ALREADY_CONSUMED');
      expect(prismaMock.trackingFlow.upsert).not.toHaveBeenCalled();
      expect(prismaMock.trackingEvent.create).not.toHaveBeenCalled();
    });

    it('should catch database constraint P2002 error gracefully and mark as IDEMPOTENT_DUPLICATE', async () => {
      const eventId = randomUUID();
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.$transaction.mockRejectedValue({ code: 'P2002' });

      const result = await service.recordDomainEvent({
        eventId,
        eventType: 'service_request.created',
        serviceRequestId: randomUUID(),
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('IDEMPOTENT_DUPLICATE');
    });
  });

  describe('Flow Upsert & Ingestion', () => {
    it('should upsert tracking_flow and create tracking_event for a valid event', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const eventId = randomUUID();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
      });

      const result = await service.recordDomainEvent({
        eventId,
        eventType: 'service_request.created',
        serviceRequestId,
        customerId,
        payload: {
          title: 'Fix Air Conditioner',
          categoryId: randomUUID(),
        },
      });

      expect(result.recorded).toBe(true);
      expect(prismaMock.consumedEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId,
          eventType: 'service_request.created',
        }),
      });
      expect(prismaMock.trackingFlow.upsert).toHaveBeenCalledWith({
        where: { serviceRequestId },
        create: expect.objectContaining({ serviceRequestId, customerId }),
        update: expect.objectContaining({ customerId }),
      });
      expect(prismaMock.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'service_request.created',
            entityType: TrackingEntityType.service_request,
            entityId: serviceRequestId,
            sourceService: 'order-service',
            writeSequence: 1,
          }),
        }),
      );
    });

    it('should link orderId to existing tracking_flow when order.created arrives', async () => {
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const customerId = randomUUID();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        orderId,
        customerId,
      });

      const result = await service.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'order.created',
        serviceRequestId,
        orderId,
        customerId,
        payload: {
          id: orderId,
          totalAmount: 500000,
        },
      });

      expect(result.recorded).toBe(true);
      expect(prismaMock.trackingFlow.upsert).toHaveBeenCalledWith({
        where: { serviceRequestId },
        create: {
          serviceRequestId,
          orderId,
          customerId,
        },
        update: {
          orderId,
          customerId,
        },
      });
    });

    it('should resolve tracking_flow via orderId if serviceRequestId is omitted in payment event', async () => {
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const paymentId = randomUUID();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        orderId,
      });
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        orderId,
      });

      const result = await service.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'payment.succeeded',
        orderId,
        payload: {
          paymentId,
          orderId,
          amount: 500000,
        },
      });

      expect(result.recorded).toBe(true);
      expect(prismaMock.trackingFlow.findUnique).toHaveBeenCalledWith({
        where: { orderId },
      });
      expect(prismaMock.trackingFlow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceRequestId },
        }),
      );
    });

    it('should buffer event in Redis when orderId is present but flow is not yet created', async () => {
      const orderId = randomUUID();
      const paymentId = randomUUID();
      const eventId = randomUUID();

      const redisMock = createRedisMock();
      const bufferedService = new TrackingEventsService(prismaMock, redisMock);
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.findUnique.mockResolvedValue(null);

      const result = await bufferedService.recordDomainEvent({
        eventId,
        eventType: 'payment.succeeded',
        orderId,
        payload: {
          paymentId,
          orderId,
          amount: 500000,
        },
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('BUFFERED_PENDING_ORDER_CREATED');
      expect(redisMock.appendListItem).toHaveBeenCalledWith(
        `tracking:pending_order_events:${orderId}`,
        expect.objectContaining({
          forcedEventType: undefined,
        }),
      );
      expect(redisMock.addToSortedSet).toHaveBeenCalledWith(
        TrackingEventsService.PENDING_ORDERS_INDEX_KEY,
        orderId,
        expect.any(Number),
      );
    });

    it('should buffer order.status.changed arriving before order.created with nextStatus', async () => {
      const orderId = randomUUID();
      const eventId = randomUUID();

      const redisMock = createRedisMock();
      const bufferedService = new TrackingEventsService(prismaMock, redisMock);
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.findUnique.mockResolvedValue(null);

      const result = await bufferedService.recordDomainEvent({
        eventId,
        eventType: 'order.status.changed',
        payload: {
          orderId,
          previousStatus: 'created',
          nextStatus: 'confirmed',
        },
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('BUFFERED_PENDING_ORDER_CREATED');
      expect(redisMock.appendListItem).toHaveBeenCalledWith(
        `tracking:pending_order_events:${orderId}`,
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'order.status.changed',
          }),
        }),
      );
      expect(redisMock.addToSortedSet).toHaveBeenCalledWith(
        TrackingEventsService.PENDING_ORDERS_INDEX_KEY,
        orderId,
        expect.any(Number),
      );
    });

    it('keeps the pending event when recording fails and acknowledges only after success', async () => {
      const orderId = randomUUID();
      const serviceRequestId = randomUUID();
      const item = {
        data: {
          eventId: randomUUID(),
          eventType: 'payment.succeeded',
          orderId,
          payload: { orderId },
        },
      };
      const pending = [{ value: item, serialized: JSON.stringify(item) }];
      const redisMock: any = createRedisMock({
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async () => {
          pending.shift();
          return true;
        }),
        getListLength: vi.fn(async () => pending.length),
      });

      const bufferedService = new TrackingEventsService(prismaMock, redisMock);
      vi.spyOn(bufferedService, 'recordDomainEvent').mockRejectedValueOnce(
        new Error('database unavailable'),
      );

      await bufferedService.flushPendingOrderEvents(
        orderId,
        serviceRequestId,
      );

      expect(pending).toHaveLength(1);
      expect(redisMock.acknowledgeListHead).not.toHaveBeenCalled();
      expect(redisMock.removeFromSortedSet).not.toHaveBeenCalled();
    });

    it('acknowledges buffered events one at a time after recording them', async () => {
      const orderId = randomUUID();
      const serviceRequestId = randomUUID();
      const items = [
        {
          data: {
            eventId: randomUUID(),
            eventType: 'payment.succeeded',
            orderId,
            payload: { orderId },
          },
        },
        {
          data: {
            eventId: randomUUID(),
            eventType: 'order.status.changed',
            orderId,
            payload: { orderId },
          },
        },
      ];
      const pending = items.map((value) => ({
        value,
        serialized: JSON.stringify(value),
      }));
      const redisMock: any = createRedisMock({
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async (_key, serialized) => {
          if (pending[0]?.serialized !== serialized) {
            return false;
          }
          pending.shift();
          return true;
        }),
        getListLength: vi.fn(async () => pending.length),
      });

      const bufferedService = new TrackingEventsService(prismaMock, redisMock);
      vi.spyOn(bufferedService, 'recordDomainEvent').mockResolvedValue({
        recorded: true,
      });

      const flushResult = await bufferedService.flushPendingOrderEvents(
        orderId,
        serviceRequestId,
      );

      expect(flushResult.flushedCount).toBe(2);
      expect(flushResult.remainingCount).toBe(0);
      expect(pending).toHaveLength(0);
      expect(bufferedService.recordDomainEvent).toHaveBeenCalledTimes(2);
      expect(redisMock.acknowledgeListHead).toHaveBeenCalledTimes(2);
      expect(redisMock.removeFromSortedSet).toHaveBeenCalledWith(
        TrackingEventsService.PENDING_ORDERS_INDEX_KEY,
        orderId,
      );
    });

    it('does not process pending events when another consumer owns the lock', async () => {
      const orderId = randomUUID();
      const redisMock: any = createRedisMock({
        withDistributedLock: vi.fn().mockResolvedValue(false),
        peekListHead: vi.fn(),
      });
      const bufferedService = new TrackingEventsService(prismaMock, redisMock);

      await bufferedService.flushPendingOrderEvents(
        orderId,
        randomUUID(),
      );

      expect(redisMock.peekListHead).not.toHaveBeenCalled();
    });

    it('should throw ORDER_FLOW_NOT_READY when order flow is missing and Redis is not available', async () => {
      const orderId = randomUUID();
      const paymentId = randomUUID();
      const eventId = randomUUID();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.findUnique.mockResolvedValue(null);

      await expect(
        service.recordDomainEvent({
          eventId,
          eventType: 'payment.succeeded',
          orderId,
          payload: {
            paymentId,
            orderId,
            amount: 500000,
          },
        }),
      ).rejects.toThrow('ORDER_FLOW_NOT_READY');
    });

    it('should drop truly invalid payload without serviceRequestId or orderId as INVALID_PAYLOAD_UNRESOLVABLE_FLOW', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);

      const result = await service.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'order.status.changed',
        payload: {
          invalidField: 'random-value',
        },
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('INVALID_PAYLOAD_UNRESOLVABLE_FLOW');
    });

    it('should map nextStatus to toStatus and previousStatus to fromStatus using exact Order Service payload contract', async () => {
      const orderId = randomUUID();
      const customerUserId = randomUUID();
      const workerUserId = randomUUID();
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        orderId,
      });
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        orderId,
      });

      const orderServicePayload = {
        orderId,
        customerId: customerUserId,
        customerUserId,
        workerId: workerUserId,
        workerUserId,
        previousStatus: 'confirmed',
        nextStatus: 'in_progress',
        notificationKind: 'status_update',
      };

      const result = await service.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'order.status.changed',
        payload: orderServicePayload,
      });

      expect(result.recorded).toBe(true);
      expect(prismaMock.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: TrackingEntityType.order,
            entityId: orderId,
            eventType: 'order.status.changed',
            fromStatus: 'confirmed',
            toStatus: 'in_progress',
            actorUserId: workerUserId,
          }),
        }),
      );
    });
  });

  describe('Pending Events Resilience & Concurrency (P1 Fixes)', () => {
    it('barrier test: consumer A misses flow, consumer B creates flow and flushes empty queue, consumer A appends and immediately flushes without further events', async () => {
      const orderId = randomUUID();
      const serviceRequestId = randomUUID();
      const paymentEventId = randomUUID();
      const flowId = randomUUID();

      let flowExists = false;
      const queue: Array<{ value: any; serialized: string }> = [];

      let pauseABeforeAppendResolve: () => void;
      const pauseABeforeAppend = new Promise<void>((resolve) => {
        pauseABeforeAppendResolve = resolve;
      });

      let consumerAReachedBarrierResolve: () => void;
      const consumerAReachedBarrier = new Promise<void>((resolve) => {
        consumerAReachedBarrierResolve = resolve;
      });

      const redisMock: any = createRedisMock({
        appendListItem: vi.fn(async (_key, value) => {
          queue.push({ value, serialized: JSON.stringify(value) });
        }),
        peekListHead: vi.fn(async () => queue[0] ?? null),
        acknowledgeListHead: vi.fn(async () => {
          queue.shift();
          return true;
        }),
        getListLength: vi.fn(async () => queue.length),
      });

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: flowId,
        orderId,
        serviceRequestId,
      });

      prismaMock.trackingFlow.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.orderId === orderId) {
          if (!flowExists) {
            consumerAReachedBarrierResolve();
            await pauseABeforeAppend;
            return null;
          }
          return { id: flowId, orderId, serviceRequestId };
        }
        return null;
      });

      const consumerAService = new TrackingEventsService(prismaMock, redisMock);
      const consumerBService = new TrackingEventsService(prismaMock, redisMock);

      // --- BARRIER STEP 1: Consumer A checks flow, finds null ---
      const consumerAPromise = consumerAService.recordDomainEvent({
        eventId: paymentEventId,
        eventType: 'payment.succeeded',
        orderId,
        payload: { orderId, amount: 500000 },
      });

      // Wait until Consumer A has queried flow and gotten null (reached barrier)
      await consumerAReachedBarrier;
      expect(queue).toHaveLength(0); // Queue is completely empty!

      // --- BARRIER STEP 2: Consumer B runs with order.created, creates flow and flushes empty queue ---
      flowExists = true;
      const consumerBResult = await consumerBService.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'order.created',
        serviceRequestId,
        orderId,
        payload: { serviceRequestId, orderId },
      });
      expect(consumerBResult.recorded).toBe(true);
      expect(redisMock.acknowledgeListHead).not.toHaveBeenCalled(); // Empty queue during B's flush

      // --- BARRIER STEP 3: Consumer A resumes, appends to Redis, checks flow (found!) and flushes ---
      pauseABeforeAppendResolve!();
      const consumerAResult = await consumerAPromise;
      expect(consumerAResult.reason).toBe('BUFFERED_PENDING_ORDER_CREATED');

      // VERIFICATION:
      // Even without any additional order events sent, Consumer A's pending event was recorded!
      expect(prismaMock.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'payment.succeeded',
            entityId: orderId,
          }),
        }),
      );
      // And the queue in Redis was acknowledged and emptied exactly once!
      expect(redisMock.acknowledgeListHead).toHaveBeenCalledTimes(1);
      expect(queue).toHaveLength(0);
      expect(redisMock.removeFromSortedSet).toHaveBeenCalledWith(
        TrackingEventsService.PENDING_ORDERS_INDEX_KEY,
        orderId,
      );
    });

    it('DB error during flush keeps event pending, then recovers and flushes cleanly on retry', async () => {
      const orderId = randomUUID();
      const serviceRequestId = randomUUID();
      const item = {
        data: {
          eventId: randomUUID(),
          eventType: 'order.status.changed',
          orderId,
          payload: { orderId, status: 'in_progress' },
        },
      };
      const pending = [{ value: item, serialized: JSON.stringify(item) }];
      const redisMock: any = createRedisMock({
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async () => {
          pending.shift();
          return true;
        }),
        getListLength: vi.fn(async () => pending.length),
      });

      const bufferedService = new TrackingEventsService(prismaMock, redisMock);

      // Attempt 1: DB fails
      vi.spyOn(bufferedService, 'recordDomainEvent').mockRejectedValueOnce(
        new Error('DB connection terminated'),
      );

      const attempt1 = await bufferedService.flushPendingOrderEvents(orderId, serviceRequestId);
      expect(attempt1.flushedCount).toBe(0);
      expect(pending).toHaveLength(1);
      expect(redisMock.acknowledgeListHead).not.toHaveBeenCalled();
      expect(redisMock.removeFromSortedSet).not.toHaveBeenCalled();

      // Attempt 2: DB recovers
      vi.spyOn(bufferedService, 'recordDomainEvent').mockResolvedValueOnce({
        recorded: true,
      });

      const attempt2 = await bufferedService.flushPendingOrderEvents(orderId, serviceRequestId);
      expect(attempt2.flushedCount).toBe(1);
      expect(attempt2.remainingCount).toBe(0);
      expect(pending).toHaveLength(0);
      expect(redisMock.acknowledgeListHead).toHaveBeenCalledTimes(1);
      expect(redisMock.removeFromSortedSet).toHaveBeenCalledWith(
        TrackingEventsService.PENDING_ORDERS_INDEX_KEY,
        orderId,
      );
    });

    it('process stops after DB commit before Redis ACK: retry recognizes consumed event and acknowledges safely without duplicate DB records', async () => {
      const orderId = randomUUID();
      const serviceRequestId = randomUUID();
      const eventId = randomUUID();
      const item = {
        data: {
          eventId,
          eventType: 'payment.succeeded',
          orderId,
          payload: { orderId },
        },
      };
      const pending = [{ value: item, serialized: JSON.stringify(item) }];
      let dbRecordsCount = 0;

      const redisMock: any = createRedisMock({
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async () => {
          pending.shift();
          return true;
        }),
        getListLength: vi.fn(async () => pending.length),
      });

      const bufferedService = new TrackingEventsService(prismaMock, redisMock);

      // Setup DB mocks
      prismaMock.consumedEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ eventId, eventType: 'payment.succeeded', consumedAt: new Date() });

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        orderId,
        serviceRequestId,
      });
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        orderId,
        serviceRequestId,
      });
      prismaMock.trackingEvent.create.mockImplementation(async () => {
        dbRecordsCount++;
        return { id: randomUUID(), eventId };
      });

      // Simulate failure in attempt 1 before Redis ACK
      redisMock.acknowledgeListHead.mockImplementationOnce(async () => {
        throw new Error('Connection lost before Redis ACK');
      });

      await bufferedService.flushPendingOrderEvents(orderId, serviceRequestId);
      expect(dbRecordsCount).toBe(1);
      expect(pending).toHaveLength(1);

      // Attempt 2: Retry recognizes ALREADY_CONSUMED and acknowledges head safely
      redisMock.acknowledgeListHead.mockImplementationOnce(async () => {
        pending.shift();
        return true;
      });

      const retryResult = await bufferedService.flushPendingOrderEvents(orderId, serviceRequestId);
      expect(retryResult.flushedCount).toBe(1);
      expect(pending).toHaveLength(0);
      expect(dbRecordsCount).toBe(1); // EXACTLY ONE DB RECORD
    });

    it('concurrent flushers: distributed lock ensures each pending event is flushed and recorded exactly once', async () => {
      const orderId = randomUUID();
      const serviceRequestId = randomUUID();
      const eventId = randomUUID();
      const item = {
        data: {
          eventId,
          eventType: 'order.status.changed',
          orderId,
          payload: { orderId },
        },
      };
      const pending = [{ value: item, serialized: JSON.stringify(item) }];
      let lockTaken = false;

      const redisMock: any = createRedisMock({
        withDistributedLock: vi.fn(async (_key, callback) => {
          if (lockTaken) {
            return false;
          }
          lockTaken = true;
          try {
            await callback(() => true, 'lock-1');
            return true;
          } finally {
            lockTaken = false;
          }
        }),
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async () => {
          pending.shift();
          return true;
        }),
        getListLength: vi.fn(async () => pending.length),
      });

      const serviceInstance1 = new TrackingEventsService(prismaMock, redisMock);
      const serviceInstance2 = new TrackingEventsService(prismaMock, redisMock);

      vi.spyOn(serviceInstance1, 'recordDomainEvent').mockResolvedValue({
        recorded: true,
      });
      vi.spyOn(serviceInstance2, 'recordDomainEvent').mockResolvedValue({
        recorded: true,
      });

      const [res1, res2] = await Promise.all([
        serviceInstance1.flushPendingOrderEvents(orderId, serviceRequestId),
        serviceInstance2.flushPendingOrderEvents(orderId, serviceRequestId),
      ]);

      expect(res1.flushedCount + res2.flushedCount).toBe(1);
      expect(pending).toHaveLength(0);
      expect(redisMock.acknowledgeListHead).toHaveBeenCalledTimes(1);
      expect(
        (serviceInstance1.recordDomainEvent as any).mock.calls.length +
        (serviceInstance2.recordDomainEvent as any).mock.calls.length,
      ).toBe(1);
    });

    it('reconciliation scans pending orders: flushes orders with matching flows and alerts for stalled ones', async () => {
      const orderIdReady = randomUUID();
      const orderIdStalled = randomUUID();
      const serviceRequestId = randomUUID();
      const now = Date.now();

      const redisMock: any = createRedisMock({
        getSortedSetRangeWithScores: vi.fn().mockResolvedValue([
          { member: orderIdReady, score: now - 5000 },
          { member: orderIdStalled, score: now - 120_000 },
        ]),
        getListLength: vi.fn(async (key: string) => {
          if (key.includes(orderIdReady)) return 1;
          if (key.includes(orderIdStalled)) return 2;
          return 0;
        }),
        peekListHead: vi.fn().mockResolvedValue(null),
      });

      prismaMock.trackingFlow.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.orderId === orderIdReady) {
          return { id: randomUUID(), orderId: orderIdReady, serviceRequestId };
        }
        return null;
      });

      const reconcilingService = new TrackingEventsService(prismaMock, redisMock);
      const flushSpy = vi
        .spyOn(reconcilingService, 'flushPendingOrderEvents')
        .mockResolvedValue({ flushedCount: 1, remainingCount: 0 });

      const loggerWarnSpy = vi.spyOn((reconcilingService as any).logger, 'warn');

      const result = await reconcilingService.reconcilePendingOrders(60_000);

      expect(result.scanned).toBe(2);
      expect(result.flushedOrders).toBe(1);
      expect(result.stalledOrders).toBe(1);
      expect(flushSpy).toHaveBeenCalledWith(orderIdReady, serviceRequestId);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PENDING_ORDER_STALLED_ALERT]'),
      );
    });
  });

  describe('Metadata Sanitization', () => {
    it('should keep safe business fields and strip sensitive items like tokens and passwords', async () => {
      const serviceRequestId = randomUUID();
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
      });

      await service.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'bid.submitted',
        serviceRequestId,
        payload: {
          amount: 150000,
          workerId: randomUUID(),
          secretToken: 'super-secret-key-123',
          password: 'my-password',
        },
      });

      expect(prismaMock.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              amount: 150000,
            }),
          }),
        }),
      );

      const passedMetadata =
        prismaMock.trackingEvent.create.mock.calls[0][0].data.metadata;
      expect(passedMetadata.secretToken).toBeUndefined();
      expect(passedMetadata.password).toBeUndefined();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate active Redis cache keys for serviceRequestId when new event is recorded', async () => {
      const serviceRequestId = randomUUID();
      const redisMock = createRedisMock();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
      });

      const cachedService = new TrackingEventsService(prismaMock, redisMock);
      await cachedService.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'service_request.published',
        serviceRequestId,
      });

      expect(redisMock.delByPattern).toHaveBeenCalledWith(
        `tracking:*:${serviceRequestId}:*`,
      );
    });
  });

  describe('Live SSE Stream Broadcasting', () => {
    it('should call streamService.broadcastEvent with created event details after commit', async () => {
      const serviceRequestId = randomUUID();
      const eventId = randomUUID();
      const streamMock: any = {
        broadcastEvent: vi.fn(),
      };

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
      });

      const createdEventRecord = {
        id: randomUUID(),
        eventId,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        fromStatus: 'arrived',
        toStatus: 'in_progress',
        actorUserId: randomUUID(),
        reason: null,
        metadata: { workerId: 'w1' },
        occurredAt: new Date(),
        recordedAt: new Date(),
        writeSequence: 1,
      };
      prismaMock.trackingEvent.create.mockResolvedValue(createdEventRecord);

      const streamingService = new TrackingEventsService(
        prismaMock,
        undefined,
        streamMock,
      );

      await streamingService.recordDomainEvent({
        eventId,
        eventType: 'order.in_progress',
        serviceRequestId,
        payload: {
          fromStatus: 'arrived',
          toStatus: 'in_progress',
        },
      });

      expect(streamMock.broadcastEvent).toHaveBeenCalledTimes(1);
      expect(streamMock.broadcastEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceRequestId,
          eventId,
          eventType: 'order.in_progress',
          entityType: TrackingEntityType.order,
          fromStatus: 'arrived',
          toStatus: 'in_progress',
        }),
      );
    });

    it('should not throw if streamService is not provided (optional dependency)', async () => {
      const serviceRequestId = randomUUID();
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
      });

      const noStreamService = new TrackingEventsService(prismaMock);
      const result = await noStreamService.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'service_request.created',
        serviceRequestId,
      });

      expect(result.recorded).toBe(true);
    });
  });
});
