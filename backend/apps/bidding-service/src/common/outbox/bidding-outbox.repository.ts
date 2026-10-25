import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OutboxRepository, type OutboxEventEntity } from '@app/common';

@Injectable()
export class BiddingOutboxRepository extends OutboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Retrieves pending events with atomic lease/claim mechanism
   * to prevent duplicate processing across multiple service replicas.
   */
  async findPendingEvents(
    limit = 20,
    now = new Date(),
  ): Promise<OutboxEventEntity[]> {
    const leaseUntil = new Date(now.getTime() + 15 * 1000);

    const fetchAndLease = async (client: any) => {
      const records = await client.outboxEvent.findMany({
        where: {
          status: { in: ['pending', 'dlq_retry'] },
          nextRetryAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      if (records.length > 0 && typeof client.outboxEvent.updateMany === 'function') {
        const ids = records.map((r: any) => r.id);
        await client.outboxEvent.updateMany({
          where: { id: { in: ids } },
          data: { nextRetryAt: leaseUntil },
        });
      }

      return records.map((r: any) => ({
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
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(fetchAndLease);
    }
    return fetchAndLease(this.prisma);
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
    retryCount: number,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'failed',
        lastError: error,
        retryCount,
      },
    });
  }

  async scheduleDlqRetry(
    id: string,
    nextRetryAt: Date,
    error: string,
    retryCount: number,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'dlq_retry',
        nextRetryAt,
        lastError: error,
        retryCount,
      },
    });
  }
}
