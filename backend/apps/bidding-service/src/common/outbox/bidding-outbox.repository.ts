import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OutboxRepository, type OutboxEventEntity } from '@app/common';

@Injectable()
export class BiddingOutboxRepository extends OutboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findPendingEvents(
    limit = 20,
    now = new Date(),
  ): Promise<OutboxEventEntity[]> {
    const records = await this.prisma.outboxEvent.findMany({
      where: {
        status: { in: ['pending', 'dlq_retry'] },
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return records.map((r) => ({
      id: r.id,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      eventType: r.eventType,
      eventVersion: r.eventVersion,
      payload: r.payload,
      status: r.status,
      retryCount: r.retryCount,
      lastError: r.lastError,
      nextRetryAt: r.nextRetryAt,
      createdAt: r.createdAt,
      publishedAt: r.publishedAt,
    }));
  }

  async markPublished(id: string, publishedAt = new Date()): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt,
      },
    });
  }

  async scheduleRetry(
    id: string,
    nextRetryAt: Date,
    retryCount: number,
    error: string,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        retryCount,
        nextRetryAt,
        lastError: error,
      },
    });
  }

  async markFailed(
    id: string,
    error: string,
    retryCount?: number,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'failed',
        ...(retryCount !== undefined ? { retryCount } : {}),
        lastError: error,
      },
    });
  }

  async scheduleDlqRetry(
    id: string,
    nextRetryAt: Date,
    error: string,
    retryCount?: number,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'dlq_retry',
        nextRetryAt,
        lastError: error,
        ...(retryCount !== undefined ? { retryCount } : {}),
      },
    });
  }
}
