import { Injectable } from '@nestjs/common';
import { AuthPrismaService } from '@app/database';
import { OutboxRepository, type OutboxEventEntity } from '@app/common';

@Injectable()
export class AuthOutboxRepository extends OutboxRepository {
  constructor(private readonly db: AuthPrismaService) {
    super();
  }

  async findPendingEvents(
    limit = 20,
    now = new Date(),
  ): Promise<OutboxEventEntity[]> {
    return this.db.outboxEvent.findMany({
      where: {
        status: { in: ['pending', 'dlq_retry'] },
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markPublished(id: string, publishedAt = new Date()): Promise<void> {
    await this.db.outboxEvent.update({
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
    await this.db.outboxEvent.update({
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
    await this.db.outboxEvent.update({
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
    await this.db.outboxEvent.update({
      where: { id },
      data: {
        status: 'dlq_retry',
        ...(retryCount !== undefined ? { retryCount } : {}),
        nextRetryAt,
        lastError: error,
      },
    });
  }
}
