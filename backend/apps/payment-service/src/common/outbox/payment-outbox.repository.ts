import { Injectable } from '@nestjs/common';
import { OutboxRepository, type OutboxEventEntity } from '@app/common';
import { PaymentPrismaService } from '../database/payment-prisma.service.js';

@Injectable()
export class PaymentOutboxRepository extends OutboxRepository {
  constructor(private readonly database: PaymentPrismaService) {
    super();
  }

  findPendingEvents(limit = 20, now = new Date()): Promise<OutboxEventEntity[]> {
    return this.database.client.outboxEvent.findMany({
      where: { status: { in: ['pending', 'dlq_retry'] }, nextRetryAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }) as Promise<OutboxEventEntity[]>;
  }

  async markPublished(id: string, publishedAt = new Date()): Promise<void> {
    await this.database.client.outboxEvent.update({ where: { id }, data: { status: 'published', publishedAt } });
  }

  async scheduleRetry(id: string, nextRetryAt: Date, retryCount: number, error: string): Promise<void> {
    await this.database.client.outboxEvent.update({ where: { id }, data: { retryCount, nextRetryAt, lastError: error } });
  }

  async markFailed(id: string, error: string, retryCount?: number): Promise<void> {
    await this.database.client.outboxEvent.update({
      where: { id },
      data: { status: 'failed', lastError: error, ...(retryCount === undefined ? {} : { retryCount }) },
    });
  }

  async scheduleDlqRetry(id: string, nextRetryAt: Date, error: string, retryCount?: number): Promise<void> {
    await this.database.client.outboxEvent.update({
      where: { id },
      data: { status: 'dlq_retry', nextRetryAt, lastError: error, ...(retryCount === undefined ? {} : { retryCount }) },
    });
  }
}
