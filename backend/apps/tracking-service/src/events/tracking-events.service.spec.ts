import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TrackingEntityType } from '@prisma/tracking-client';
import { TrackingEventsService } from './tracking-events.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

describe('TrackingEventsService', () => {
  let service: TrackingEventsService;
  let prismaMock: any;

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

    it('should handle race condition duplicate via database P2002 constraint error gracefully', async () => {
      const eventId = randomUUID();
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);

      const p2002Error: any = new Error('Unique constraint failed');
      p2002Error.code = 'P2002';
      prismaMock.$transaction.mockRejectedValue(p2002Error);

      const result = await service.recordDomainEvent({
        eventId,
        eventType: 'bid.submitted',
        serviceRequestId: randomUUID(),
      });

      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('IDEMPOTENT_DUPLICATE');
    });
  });

  describe('Out-of-Order Event Handling', () => {
    it('should upsert tracking_flow on first event even if bid.submitted arrives before service_request.created', async () => {
      const serviceRequestId = randomUUID();
      const workerId = randomUUID();
      const bidId = randomUUID();
      const eventId = randomUUID();
      const flowId = randomUUID();

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        orderId: null,
        customerId: null,
      });

      const result = await service.recordDomainEvent({
        eventId,
        eventType: 'bid.submitted',
        serviceRequestId,
        payload: {
          bidId,
          workerId,
          amount: 500000,
        },
      });

      expect(result.recorded).toBe(true);
      expect(prismaMock.trackingFlow.upsert).toHaveBeenCalledWith({
        where: { serviceRequestId },
        create: {
          serviceRequestId,
          orderId: null,
          customerId: null,
        },
        update: {},
      });
      expect(prismaMock.trackingFlow.update).toHaveBeenCalledWith({
        where: { id: flowId },
        data: { eventSequence: { increment: 1 } },
        select: { eventSequence: true },
      });
      expect(prismaMock.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: TrackingEntityType.bid,
            entityId: bidId,
            eventType: 'bid.submitted',
            sourceService: 'bidding-service',
            writeSequence: 1,
          }),
        }),
      );
    });

    it('should link orderId to tracking_flow when order.created arrives', async () => {
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const customerId = randomUUID();
      const workerId = randomUUID();

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
        payload: {
          orderId,
          customerId,
          workerId,
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

      const redisMock: any = {
        appendListItem: vi.fn(),
        delByPattern: vi.fn(),
      };

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
    });

    it('should buffer order.status.changed arriving before order.created with nextStatus', async () => {
      const orderId = randomUUID();
      const eventId = randomUUID();

      const redisMock: any = {
        appendListItem: vi.fn(),
        delByPattern: vi.fn(),
      };

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
      const redisMock: any = {
        withDistributedLock: vi.fn(async (_key, callback) => callback(() => true)),
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async () => {
          pending.shift();
          return true;
        }),
      };
      const bufferedService = new TrackingEventsService(prismaMock, redisMock);
      vi.spyOn(bufferedService, 'recordDomainEvent').mockRejectedValueOnce(
        new Error('database unavailable'),
      );

      await (bufferedService as any).flushPendingOrderEvents(
        orderId,
        serviceRequestId,
      );

      expect(pending).toHaveLength(1);
      expect(redisMock.acknowledgeListHead).not.toHaveBeenCalled();
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
      const redisMock: any = {
        withDistributedLock: vi.fn(async (_key, callback) => callback(() => true)),
        peekListHead: vi.fn(async () => pending[0] ?? null),
        acknowledgeListHead: vi.fn(async (_key, serialized) => {
          if (pending[0]?.serialized !== serialized) {
            return false;
          }
          pending.shift();
          return true;
        }),
      };
      const bufferedService = new TrackingEventsService(prismaMock, redisMock);
      vi.spyOn(bufferedService, 'recordDomainEvent').mockResolvedValue({
        recorded: true,
      });

      await (bufferedService as any).flushPendingOrderEvents(
        orderId,
        serviceRequestId,
      );

      expect(pending).toHaveLength(0);
      expect(bufferedService.recordDomainEvent).toHaveBeenCalledTimes(2);
      expect(redisMock.acknowledgeListHead).toHaveBeenCalledTimes(2);
    });

    it('does not process pending events when another consumer owns the lock', async () => {
      const orderId = randomUUID();
      const redisMock: any = {
        withDistributedLock: vi.fn().mockResolvedValue(false),
        peekListHead: vi.fn(),
      };
      const bufferedService = new TrackingEventsService(prismaMock, redisMock);

      await (bufferedService as any).flushPendingOrderEvents(
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

      // Exact outbox payload emitted by Order Service emitOrderStatusChangedEvent
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
      const redisMock: any = {
        delByPattern: vi.fn().mockResolvedValue(undefined),
      };

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
