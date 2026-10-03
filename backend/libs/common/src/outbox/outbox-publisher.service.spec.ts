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
      expect(rabbitmqMock.emit).toHaveBeenCalledWith('user.registered', { userId: 'u1' });
      expect(repoMock.markPublished).toHaveBeenCalledWith('event-1', expect.any(Date));
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
