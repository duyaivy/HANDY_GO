import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrderOutboxPublisherService } from './order-outbox-publisher.service.js';
import type { OrderOutboxRepository } from './order-outbox.repository.js';
import type { RabbitMQService } from '@app/rabbitmq';

describe('OrderOutboxPublisherService', () => {
  let service: OrderOutboxPublisherService;
  let repoMock: {
    findPendingEvents: ReturnType<typeof vi.fn>;
    markPublished: ReturnType<typeof vi.fn>;
    scheduleRetry: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
    scheduleDlqRetry: ReturnType<typeof vi.fn>;
  };
  let rabbitmqMock: {
    emit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repoMock = {
      findPendingEvents: vi.fn(),
      markPublished: vi.fn(),
      scheduleRetry: vi.fn(),
      markFailed: vi.fn(),
      scheduleDlqRetry: vi.fn(),
    };
    rabbitmqMock = {
      emit: vi.fn(),
    };

    service = new OrderOutboxPublisherService(
      repoMock as unknown as OrderOutboxRepository,
      rabbitmqMock as unknown as RabbitMQService,
    );
  });

  it('should publish pending events wrapped in notification envelope and mark them as published', async () => {
    const fixedCreatedAt = new Date('2026-10-27T10:00:00.000Z');
    const events = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        status: 'pending',
        eventType: 'order.created',
        eventVersion: 1,
        payload: { orderId: 'ord-1', customerId: 'cust-1' },
        createdAt: fixedCreatedAt,
        retryCount: 0,
      },
    ];
    repoMock.findPendingEvents.mockResolvedValue(events);
    rabbitmqMock.emit.mockResolvedValue(undefined);

    const count = await service.publishPendingEvents();

    expect(rabbitmqMock.emit).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({
        eventId: '11111111-1111-1111-1111-111111111111',
        eventType: 'order.created',
        eventVersion: 1,
        source: 'order-service',
        producer: 'order-service',
        occurredAt: '2026-10-27T10:00:00.000Z',
        orderId: 'ord-1',
        customerId: 'cust-1',
        payload: { orderId: 'ord-1', customerId: 'cust-1' },
        data: { orderId: 'ord-1', customerId: 'cust-1' },
      }),
    );
    expect(repoMock.markPublished).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      expect.any(Date),
    );
    expect(count).toBe(1);
  });

  it('should schedule retry when publishing fails and preserve eventId and occurredAt', async () => {
    const fixedCreatedAt = new Date('2026-10-27T10:00:00.000Z');
    const events = [
      {
        id: '22222222-2222-2222-2222-222222222222',
        status: 'pending',
        eventType: 'order.completed',
        eventVersion: 1,
        payload: { orderId: 'ord-2' },
        createdAt: fixedCreatedAt,
        retryCount: 1,
      },
    ];
    repoMock.findPendingEvents.mockResolvedValue(events);
    rabbitmqMock.emit.mockRejectedValue(new Error('Connection dropped'));

    await service.publishPendingEvents();

    expect(repoMock.scheduleRetry).toHaveBeenCalledWith(
      '22222222-2222-2222-2222-222222222222',
      expect.any(Date),
      2,
      'Connection dropped',
    );

    // Verify envelope preserves identical eventId and occurredAt
    const envelope = service.buildEnvelope(events[0]);
    expect(envelope.eventId).toBe('22222222-2222-2222-2222-222222222222');
    expect(envelope.occurredAt).toBe('2026-10-27T10:00:00.000Z');
  });
});
