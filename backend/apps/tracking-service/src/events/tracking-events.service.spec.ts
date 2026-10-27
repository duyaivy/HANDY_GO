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
});
