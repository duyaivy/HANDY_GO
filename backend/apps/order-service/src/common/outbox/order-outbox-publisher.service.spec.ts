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

  it('should publish pending events and mark them as published', async () => {
    const events = [
      {
        id: 'evt-1',
        status: 'pending',
        eventType: 'order.created',
        payload: { orderId: 'ord-1' },
        retryCount: 0,
      },
    ];
    repoMock.findPendingEvents.mockResolvedValue(events);
    rabbitmqMock.emit.mockResolvedValue(undefined);

    const count = await service.publishPendingEvents();

    expect(rabbitmqMock.emit).toHaveBeenCalledWith('order.created', {
      orderId: 'ord-1',
    });
    expect(repoMock.markPublished).toHaveBeenCalledWith('evt-1', expect.any(Date));
    expect(count).toBe(1);
  });

  it('should schedule retry when publishing fails', async () => {
    const events = [
      {
        id: 'evt-2',
        status: 'pending',
        eventType: 'order.completed',
        payload: { orderId: 'ord-2' },
        retryCount: 1,
      },
    ];
    repoMock.findPendingEvents.mockResolvedValue(events);
    rabbitmqMock.emit.mockRejectedValue(new Error('Connection dropped'));

    await service.publishPendingEvents();

    expect(repoMock.scheduleRetry).toHaveBeenCalledWith(
      'evt-2',
      expect.any(Date),
      2,
      'Connection dropped',
    );
  });
});
