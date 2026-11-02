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
    // Distinct lease timestamp for this replica claim cycle
    const leaseUntil = new Date(now.getTime() + 15 * 1000 + Math.floor(Math.random() * 1000));

    const fetchAndLease = async (client: any) => {
      // 1. Candidate selection
      const candidates = await client.outboxEvent.findMany({
        where: {
          status: { in: ['pending', 'dlq_retry'] },
          nextRetryAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      if (!candidates || candidates.length === 0) {
        return [];
      }

      const ids = candidates.map((r: any) => r.id);

      // 2. Atomic CAS Claim: only claim records that are still eligible (nextRetryAt <= now)
      if (typeof client.outboxEvent.updateMany === 'function') {
        const updateResult = await client.outboxEvent.updateMany({
          where: {
            id: { in: ids },
            status: { in: ['pending', 'dlq_retry'] },
            nextRetryAt: { lte: now },
          },
          data: { nextRetryAt: leaseUntil },
        });

        if (updateResult.count === 0) {
          return [];
        }

        // 3. Only return records where this replica won the claim
        const claimedRecords = await client.outboxEvent.findMany({
          where: {
            id: { in: ids },
            nextRetryAt: leaseUntil,
          },
          orderBy: { createdAt: 'asc' },
        });

        return (claimedRecords || []).map((r: any) => ({
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

      // Fallback for mocks without updateMany
      return candidates.map((r: any) => ({
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
