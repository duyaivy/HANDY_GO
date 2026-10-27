import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrderOutboxRepository } from './order-outbox.repository.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('OrderOutboxRepository', () => {
  let repository: OrderOutboxRepository;
  let prismaMock: {
    outboxEvent: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prismaMock = {
      outboxEvent: {
        create: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };
    repository = new OrderOutboxRepository(prismaMock as unknown as PrismaService);
  });

  describe('createEvent', () => {
    it('should create an outbox event with default version 1', async () => {
      const eventData = {
        aggregateType: 'Order',
        aggregateId: '11111111-1111-1111-1111-111111111111',
        eventType: 'order.created',
        payload: { orderId: '11111111-1111-1111-1111-111111111111' },
      };

      prismaMock.outboxEvent.create.mockResolvedValue({ id: 'evt-1', ...eventData });

      const result = await repository.createEvent(eventData);

      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'Order',
          aggregateId: '11111111-1111-1111-1111-111111111111',
          eventType: 'order.created',
          eventVersion: 1,
          payload: { orderId: '11111111-1111-1111-1111-111111111111' },
        },
      });
      expect(result).toHaveProperty('id', 'evt-1');
    });

    it('should use transaction client if provided', async () => {
      const txMock = {
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: 'tx-evt' }),
        },
      };

      const eventData = {
        aggregateType: 'ServiceRequest',
        aggregateId: '22222222-2222-2222-2222-222222222222',
        eventType: 'service_request.published',
        eventVersion: 2,
        payload: { requestId: '22222222-2222-2222-2222-222222222222' },
      };

      const result = await repository.createEvent(eventData, txMock as any);

      expect(txMock.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          aggregateType: 'ServiceRequest',
          aggregateId: '22222222-2222-2222-2222-222222222222',
          eventType: 'service_request.published',
          eventVersion: 2,
          payload: { requestId: '22222222-2222-2222-2222-222222222222' },
        },
      });
      expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'tx-evt' });
    });
  });

  describe('findPendingEvents', () => {
    it('should query pending and dlq_retry events with retry time <= now', async () => {
      const now = new Date('2026-10-23T12:00:00Z');
      const mockEvents = [{ id: 'evt-1' }, { id: 'evt-2' }];
      prismaMock.outboxEvent.findMany.mockResolvedValue(mockEvents);

      const events = await repository.findPendingEvents(10, now);

      expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['pending', 'dlq_retry'] },
          nextRetryAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      expect(events).toEqual(mockEvents);
    });
  });

  describe('markPublished', () => {
    it('should update event status to published', async () => {
      const pubDate = new Date();
      prismaMock.outboxEvent.update.mockResolvedValue({});

      await repository.markPublished('evt-1', pubDate);

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'published',
          publishedAt: pubDate,
        },
      });
    });
  });

  describe('scheduleRetry', () => {
    it('should update retry count, next retry time and last error', async () => {
      const nextRetry = new Date(Date.now() + 5000);
      prismaMock.outboxEvent.update.mockResolvedValue({});

      await repository.scheduleRetry('evt-1', nextRetry, 2, 'Connection refused');

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          retryCount: 2,
          nextRetryAt: nextRetry,
          lastError: 'Connection refused',
        },
      });
    });
  });

  describe('markFailed', () => {
    it('should update event status to failed', async () => {
      prismaMock.outboxEvent.update.mockResolvedValue({});

      await repository.markFailed('evt-1', 'Max retries exceeded', 5);

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'failed',
          retryCount: 5,
          lastError: 'Max retries exceeded',
        },
      });
    });
  });

  describe('scheduleDlqRetry', () => {
    it('should update event status to dlq_retry', async () => {
      const nextRetry = new Date(Date.now() + 60000);
      prismaMock.outboxEvent.update.mockResolvedValue({});

      await repository.scheduleDlqRetry('evt-1', nextRetry, 'DLQ temporary failure', 1);

      expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          status: 'dlq_retry',
          retryCount: 1,
          nextRetryAt: nextRetry,
          lastError: 'DLQ temporary failure',
        },
      });
    });
  });
});
