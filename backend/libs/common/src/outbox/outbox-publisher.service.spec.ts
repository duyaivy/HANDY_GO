import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RabbitMQService } from '@app/rabbitmq';
import { OutboxPublisherService } from './outbox-publisher.service.js';
import { OutboxRepository } from './outbox.repository.js';
import type { OutboxEventEntity } from './outbox.types.js';

describe('OutboxPublisherService', () => {
  let service: OutboxPublisherService;
  let repoMock: OutboxRepository;
  let rabbitmqMock: RabbitMQService;

  beforeEach(() => {
    repoMock = {
      findPendingEvents: vi.fn().mockResolvedValue([]),
      markPublished: vi.fn().mockResolvedValue(undefined),
      scheduleRetry: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      scheduleDlqRetry: vi.fn().mockResolvedValue(undefined),
    } as unknown as OutboxRepository;

    rabbitmqMock = {
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as RabbitMQService;

    service = new OutboxPublisherService(repoMock, rabbitmqMock);
  });

  describe('publishPendingEvents', () => {
    it('should publish pending events and mark them as published', async () => {
      const mockEvent: OutboxEventEntity = {
        id: 'event-1',
        eventType: 'user.registered',
        payload: { userId: 'u1' },
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([mockEvent]);

      const count = await service.publishPendingEvents();

      expect(count).toBe(1);
      expect(rabbitmqMock.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.objectContaining({
          eventId: 'event-1',
          eventType: 'user.registered',
          eventVersion: 1,
          data: { userId: 'u1' },
          payload: { userId: 'u1' },
        }),
      );
      expect(repoMock.markPublished).toHaveBeenCalledWith('event-1', expect.any(Date));
    });

    it('should preserve already structured DomainEvent envelope (e.g. Auth user.registered version 3) without double wrapping data (F-B)', async () => {
      const authPayload = {
        eventId: 'evt-auth-123',
        eventVersion: 3,
        occurredAt: '2026-10-26T12:00:00.000Z',
        producer: 'auth-service',
        data: {
          userId: 'u-123',
          accountId: 'acc-123',
          fullName: 'Nguyen Van A',
          roles: ['CUSTOMER', 'WORKER'],
        },
      };

      const mockEvent: OutboxEventEntity = {
        id: 'evt-auth-123',
        eventType: 'user.registered',
        eventVersion: 3,
        payload: authPayload,
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([mockEvent]);

      const count = await service.publishPendingEvents();

      expect(count).toBe(1);
      expect(rabbitmqMock.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.objectContaining({
          eventId: 'evt-auth-123',
          eventType: 'user.registered',
          eventVersion: 3,
          producer: 'auth-service',
          source: 'auth-service',
          data: {
            userId: 'u-123',
            accountId: 'acc-123',
            fullName: 'Nguyen Van A',
            roles: ['CUSTOMER', 'WORKER'],
          },
        }),
      );
      const emittedEnvelope = (rabbitmqMock.emit as any).mock.calls[0][1];
      expect(emittedEnvelope.data.data).toBeUndefined();
      expect(emittedEnvelope.data.roles).toEqual(['CUSTOMER', 'WORKER']);
      expect(emittedEnvelope.data.userId).toBe('u-123');
    });

    it('end-to-end: Auth register-flow outbox event (v3) -> OutboxPublisherService -> UserTrustService consumer successfully provisions user and profiles', async () => {
      const { RegisterRole } = await import('@app/auth');

      // 1. Outbox record produced by auth-service register-flow.service.ts
      const authOutboxRecord: OutboxEventEntity = {
        id: 'evt-auth-v3-e2e',
        eventType: 'user.registered',
        eventVersion: 3,
        payload: {
          eventId: 'evt-auth-v3-e2e',
          eventVersion: 3,
          occurredAt: new Date().toISOString(),
          producer: 'auth-service',
          data: {
            userId: 'user-auth-v3',
            accountId: 'acc-auth-v3',
            fullName: 'Nguyen Thi B',
            roles: [RegisterRole.CUSTOMER, RegisterRole.WORKER],
          },
        },
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([authOutboxRecord]);

      // 2. Shared publisher runs
      await service.publishPendingEvents();

      expect(rabbitmqMock.emit).toHaveBeenCalledWith('user.registered', expect.anything());
      const publishedEnvelope = (rabbitmqMock.emit as any).mock.calls[0][1];

      // 3. Pass emitted envelope directly to UserTrustServiceService consumer
      const dbMock: any = {
        eventInbox: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: publishedEnvelope.eventId }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'user-auth-v3' }),
        },
        customerProfile: {
          upsert: vi.fn().mockResolvedValue({ id: 'prof-cust' }),
        },
        workerProfile: {
          upsert: vi.fn().mockResolvedValue({ id: 'prof-work' }),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => cb(dbMock)),
      };

      const { UserTrustServiceService } = await import(
        '../../../../apps/user-trust-service/src/user-trust-service.service.js'
      );
      const userTrustService = new UserTrustServiceService(dbMock);

      const consumerResult = await userTrustService.handleUserRegistered(publishedEnvelope);

      // Verified: Provisioning succeeds without being blocked by nested data or missing roles!
      expect(consumerResult.processed).toBe(true);
      expect(consumerResult.idempotent).toBe(false);
      expect(dbMock.eventInbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: 'evt-auth-v3-e2e',
            producer: 'auth-service',
          }),
        }),
      );
      expect(dbMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ id: 'user-auth-v3' }),
        }),
      );
      expect(dbMock.customerProfile.upsert).toHaveBeenCalled();
      expect(dbMock.workerProfile.upsert).toHaveBeenCalled();
    });

    it('end-to-end: Auth outbox event (v2) -> OutboxPublisherService -> UserTrustService consumer successfully provisions customer', async () => {
      const { RegisterRole } = await import('@app/auth');

      const authV2Record: OutboxEventEntity = {
        id: 'evt-auth-v2-e2e',
        eventType: 'user.registered',
        eventVersion: 2,
        payload: {
          eventId: 'evt-auth-v2-e2e',
          eventVersion: 2,
          occurredAt: new Date().toISOString(),
          producer: 'auth-service',
          data: {
            userId: 'user-auth-v2',
            accountId: 'acc-auth-v2',
            fullName: 'Tran Van C',
            role: RegisterRole.CUSTOMER,
          },
        },
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([authV2Record]);

      await service.publishPendingEvents();

      const publishedEnvelope = (rabbitmqMock.emit as any).mock.calls[0][1];

      const dbMock: any = {
        eventInbox: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: publishedEnvelope.eventId }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'user-auth-v2' }),
        },
        customerProfile: {
          upsert: vi.fn().mockResolvedValue({ id: 'prof-cust-v2' }),
        },
        workerProfile: {
          upsert: vi.fn(),
        },
        $transaction: vi.fn(async (cb: (tx: any) => any) => cb(dbMock)),
      };

      const { UserTrustServiceService } = await import(
        '../../../../apps/user-trust-service/src/user-trust-service.service.js'
      );
      const userTrustService = new UserTrustServiceService(dbMock);

      const consumerResult = await userTrustService.handleUserRegistered(publishedEnvelope);

      expect(consumerResult.processed).toBe(true);
      expect(consumerResult.idempotent).toBe(false);
      expect(dbMock.user.create).toHaveBeenCalled();
      expect(dbMock.customerProfile.upsert).toHaveBeenCalled();
      expect(dbMock.workerProfile.upsert).not.toHaveBeenCalled();
    });

    it('end-to-end: Bidding outbox event -> OutboxPublisherService -> Notification validateNotificationEvent passes 100%', async () => {
      const { randomUUID } = await import('crypto');
      const bidId = randomUUID();
      const requestId = randomUUID();
      const customerId = randomUUID();
      const outboxId = randomUUID();

      const bidOutboxRecord: OutboxEventEntity = {
        id: outboxId,
        aggregateType: 'bid',
        aggregateId: bidId,
        eventType: 'bid.submitted',
        eventVersion: 1,
        payload: {
          bidId,
          serviceRequestId: requestId,
          requestId,
          customerId,
          workerId: randomUUID(),
          amount: 250000,
          message: 'Báo giá sửa nước',
        },
        status: 'pending',
        retryCount: 0,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([bidOutboxRecord]);

      await service.publishPendingEvents();

      const emittedEnvelope = (rabbitmqMock.emit as any).mock.calls[0][1];

      const { validateNotificationEvent } = await import(
        '../../../../apps/notification-service/src/events/event-contracts.js'
      );

      const validated = validateNotificationEvent(emittedEnvelope, 'bid.submitted');
      expect(validated.eventId).toBe(outboxId);
      expect(validated.source).toBe('bidding-service');
      expect(validated.data.bidId).toBe(bidId.toLowerCase());
      expect(validated.data.requestId).toBe(requestId.toLowerCase());
      expect(validated.data.customerId).toBe(customerId.toLowerCase());
    });

    it('should schedule retry with backoff on publish error (attempts < 5)', async () => {
      const mockEvent: OutboxEventEntity = {
        id: 'event-2',
        eventType: 'user.registered',
        payload: { userId: 'u2' },
        status: 'pending',
        retryCount: 1,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([mockEvent]);
      vi.spyOn(rabbitmqMock, 'emit').mockRejectedValueOnce(new Error('Broker disconnected'));

      const count = await service.publishPendingEvents();

      expect(count).toBe(0);
      expect(repoMock.scheduleRetry).toHaveBeenCalledWith(
        'event-2',
        expect.any(Date),
        2,
        'Broker disconnected',
      );
    });

    it('should route event to DLQ and mark failed when reaching 5 retries', async () => {
      const mockEvent: OutboxEventEntity = {
        id: 'event-3',
        eventType: 'user.registered',
        payload: { userId: 'u3' },
        status: 'pending',
        retryCount: 4,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([mockEvent]);
      vi.spyOn(rabbitmqMock, 'emit')
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce(undefined); // DLQ emit succeeds

      const count = await service.publishPendingEvents();

      expect(count).toBe(0);
      expect(rabbitmqMock.emit).toHaveBeenCalledWith(
        'handy-go.dlq',
        expect.objectContaining({
          failedEventId: 'event-3',
          eventType: 'user.registered',
          retries: 5,
          error: 'Network failure',
        }),
      );
      expect(repoMock.markFailed).toHaveBeenCalledWith('event-3', 'Network failure', 5);
    });

    it('should schedule DLQ retry if routing to DLQ fails', async () => {
      const mockEvent: OutboxEventEntity = {
        id: 'event-4',
        eventType: 'user.registered',
        payload: { userId: 'u4' },
        status: 'pending',
        retryCount: 4,
        nextRetryAt: new Date(),
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([mockEvent]);
      vi.spyOn(rabbitmqMock, 'emit')
        .mockRejectedValueOnce(new Error('Initial failure'))
        .mockRejectedValueOnce(new Error('DLQ unreachable'));

      await service.publishPendingEvents();

      expect(repoMock.scheduleDlqRetry).toHaveBeenCalledWith(
        'event-4',
        expect.any(Date),
        'DLQ publish failed: DLQ unreachable',
        5,
      );
    });

    it('should retry DLQ publish when event status is dlq_retry', async () => {
      const mockEvent: OutboxEventEntity = {
        id: 'event-5',
        eventType: 'user.registered',
        payload: { userId: 'u5' },
        status: 'dlq_retry',
        retryCount: 5,
        nextRetryAt: new Date(),
        lastError: 'Previous DLQ error',
      };

      vi.spyOn(repoMock, 'findPendingEvents').mockResolvedValueOnce([mockEvent]);
      vi.spyOn(rabbitmqMock, 'emit').mockResolvedValueOnce(undefined);

      await service.publishPendingEvents();

      expect(rabbitmqMock.emit).toHaveBeenCalledWith('handy-go.dlq', expect.anything());
      expect(repoMock.markFailed).toHaveBeenCalledWith(
        'event-5',
        'Routing to DLQ completed after retry',
        5,
      );
    });
  });

  describe('triggerPublish', () => {
    it('should call publishPendingEvents', async () => {
      const spy = vi.spyOn(service, 'publishPendingEvents').mockResolvedValue(2);
      await service.triggerPublish();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('should handle onModuleInit and onModuleDestroy cleanly', () => {
      service.onModuleInit();
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
