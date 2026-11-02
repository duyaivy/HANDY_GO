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

      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
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
      expect(prismaMock.trackingEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: TrackingEntityType.bid,
            entityId: bidId,
            eventType: 'bid.submitted',
            sourceService: 'bidding-service',
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
        rpush: vi.fn(),
        expire: vi.fn(),
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
      expect(redisMock.rpush).toHaveBeenCalledWith(
        `tracking:pending_order_events:${orderId}`,
        expect.objectContaining({
          forcedEventType: undefined,
        }),
      );
      expect(redisMock.expire).toHaveBeenCalledWith(
        `tracking:pending_order_events:${orderId}`,
        3600,
      );
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

