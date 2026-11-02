import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BiddingOutboxRepository } from './bidding-outbox.repository.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('BiddingOutboxRepository', () => {
  let repository: BiddingOutboxRepository;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      outboxEvent: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
    };

    repository = new BiddingOutboxRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  it('findPendingEvents nên query đúng điều kiện pending và nextRetryAt <= now', async () => {
    const mockEvents = [
      {
        id: 'evt-1',
        aggregateType: 'bid',
        aggregateId: 'bid-1',
        eventType: 'bid.submitted',
        eventVersion: 1,
        payload: { amount: 300000 },
        status: 'pending',
        retryCount: 0,
        lastError: null,
        nextRetryAt: new Date(),
        createdAt: new Date(),
        publishedAt: null,
      },
    ];

    prismaMock.outboxEvent.findMany.mockResolvedValue(mockEvents);

    const now = new Date();
    const result = await repository.findPendingEvents(10, now);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('evt-1');
    expect(prismaMock.outboxEvent.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending', 'dlq_retry'] },
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
  });

  it('markPublished nên cập nhật status là published và lưu publishedAt', async () => {
    const publishedAt = new Date();
    await repository.markPublished('evt-1', publishedAt);

    expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: {
        status: 'published',
        publishedAt,
      },
    });
  });

  it('scheduleRetry nên cập nhật retryCount và nextRetryAt', async () => {
    const nextRetryAt = new Date(Date.now() + 5000);
    await repository.scheduleRetry('evt-1', nextRetryAt, 2, 'Network timeout');

    expect(prismaMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: {
        retryCount: 2,
        nextRetryAt,
        lastError: 'Network timeout',
      },
    });
  });
});
