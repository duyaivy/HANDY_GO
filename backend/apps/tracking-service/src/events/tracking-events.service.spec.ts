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
    appendAndTrackPendingOrder: vi.fn(),
    cleanupPendingOrderIfEmpty: vi.fn().mockResolvedValue(0),
    peekListHead: vi.fn(),
    acknowledgeListHead: vi.fn(),
    getListLength: vi.fn().mockResolvedValue(0),
    addToSortedSet: vi.fn(),
    removeFromSortedSet: vi.fn(),
    getSortedSetRangeWithScores: vi.fn().mockResolvedValue([]),
    withDistributedLock: vi.fn(async (_key, callback) => {
      await callback(() => true, 'test-lock-token');
      return true;
    }),
    delByPattern: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(() => {
    prismaMock = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      pendingTrackingEvent: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
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
      prismaMock.consumedEvent.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ eventId });
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

  describe('PostgreSQL pending inbox', () => {
    const pendingData = () => ({
      eventId: randomUUID(),
      eventType: 'order.status.changed',
      payload: { orderId: randomUUID(), nextStatus: 'in_progress' },
    });

    it('commits pending without Redis and preserves the original envelope and ID on redelivery', async () => {
      const event = pendingData();
      await service.recordDomainEvent(event);
      await service.recordDomainEvent(event);
      expect(prismaMock.pendingTrackingEvent.upsert).toHaveBeenCalledTimes(2);
      expect(prismaMock.pendingTrackingEvent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: event.eventId },
          update: {},
          create: expect.objectContaining({
            envelope: event,
            orderId: event.payload.orderId,
          }),
        }),
      );
      expect(prismaMock.consumedEvent.create).not.toHaveBeenCalled();
    });

    it('does not return success before the pending transaction commits', async () => {
      let rejectCommit!: (error: Error) => void;
      prismaMock.$transaction.mockImplementationOnce(async (callback: any) => {
        await callback(prismaMock);
        await new Promise((_resolve, reject) => {
          rejectCommit = reject;
        });
      });
      let resolved = false;
      const promise = service.recordDomainEvent(pendingData()).then(() => {
        resolved = true;
      });
      await vi.waitFor(() => expect(rejectCommit).toBeDefined());
      expect(resolved).toBe(false);
      rejectCommit(new Error('commit failed'));
      await expect(promise).rejects.toThrow('commit failed');
    });

    it('rejects missing event IDs instead of generating a different ID on retry', async () => {
      await expect(
        service.recordDomainEvent({ orderId: randomUUID() }),
      ).rejects.toThrow('INVALID_EVENT_ID');
    });

    it('rechecks flow after pending commit to close the creation race', async () => {
      const event = pendingData();
      prismaMock.trackingFlow.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ serviceRequestId: 'request' });
      const flush = vi
        .spyOn(service, 'flushPendingOrderEvents')
        .mockResolvedValue({ status: 'completed', flushedCount: 1 });
      await service.recordDomainEvent(event);
      expect(flush).toHaveBeenCalledWith(event.payload.orderId, 'request');
    });

    it('deletes pending in the same transaction as the tracking event write', async () => {
      const event = pendingData();
      prismaMock.trackingFlow.upsert.mockResolvedValue({ id: randomUUID() });
      const tx = {
        ...prismaMock,
        pendingTrackingEvent: { deleteMany: vi.fn() },
      };
      prismaMock.$transaction.mockImplementationOnce((callback: any) =>
        callback(tx),
      );
      await service.recordDomainEvent(
        { ...event, serviceRequestId: randomUUID() },
        undefined,
        true,
      );
      expect(tx.pendingTrackingEvent.deleteMany).toHaveBeenCalledWith({
        where: { eventId: event.eventId },
      });
      expect(prismaMock.pendingTrackingEvent.deleteMany).not.toHaveBeenCalled();
    });

    it('keeps failed pending for retry and does not prevent the next event from progressing', async () => {
      const event = pendingData();
      prismaMock.pendingTrackingEvent.findMany.mockResolvedValue([
        {
          ...event,
          orderId: event.payload.orderId,
          envelope: event,
          attempts: 0,
        },
      ]);
      vi.spyOn(service, 'recordDomainEvent')
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce({ recorded: true });
      const failed = await service.flushPendingOrderEvents(
        event.payload.orderId,
        randomUUID(),
      );
      expect(failed.status).toBe('failed');
      expect(prismaMock.pendingTrackingEvent.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.pendingTrackingEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ attempts: { increment: 1 } }),
        }),
      );
      expect(
        (
          await service.flushPendingOrderEvents(
            event.payload.orderId,
            randomUUID(),
          )
        ).flushedCount,
      ).toBe(1);
    });

    it('scheduler retries durable pending after constructing a new service instance', async () => {
      const event = pendingData();
      prismaMock.pendingTrackingEvent.findMany.mockResolvedValue([
        {
          ...event,
          orderId: event.payload.orderId,
          envelope: event,
          attempts: 0,
          receivedAt: new Date(),
        },
      ]);
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        serviceRequestId: randomUUID(),
      });
      const restarted = new TrackingEventsService(prismaMock);
      const flush = vi
        .spyOn(restarted, 'flushPendingOrderEvents')
        .mockResolvedValue({ status: 'completed', flushedCount: 1 });
      expect((await restarted.reconcilePendingOrders()).flushedOrders).toBe(1);
      expect(flush).toHaveBeenCalled();
    });

    it('does not ACK an unrelated unique violation as a consumed event', async () => {
      prismaMock.$transaction.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.recordDomainEvent({
          ...pendingData(),
          serviceRequestId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
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

    it('should retain reworkReason, disputeReason, and resolution in metadata (whitelist)', async () => {
      const serviceRequestId = randomUUID();
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);
      prismaMock.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
      });

      await service.recordDomainEvent({
        eventId: randomUUID(),
        eventType: 'order.status.changed',
        serviceRequestId,
        payload: {
          previousStatus: 'finished',
          nextStatus: 'in_progress',
          reworkReason: 'Khách yêu cầu sơn lại lớp thứ hai',
          disputeReason: 'Tranh chấp tiến độ thi công',
          resolution: 'resume_previous_state',
          resolutionNote: 'Admin yêu cầu thợ hoàn thành sơn lớp 2',
          secretInternalKey: 'must-not-be-included',
        },
      });

      const passedMetadata =
        prismaMock.trackingEvent.create.mock.calls[0][0].data.metadata;
      expect(passedMetadata.reworkReason).toBe(
        'Khách yêu cầu sơn lại lớp thứ hai',
      );
      expect(passedMetadata.disputeReason).toBe('Tranh chấp tiến độ thi công');
      expect(passedMetadata.resolution).toBe('resume_previous_state');
      expect(passedMetadata.resolutionNote).toBe(
        'Admin yêu cầu thợ hoàn thành sơn lớp 2',
      );
      expect(passedMetadata.secretInternalKey).toBeUndefined();
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
