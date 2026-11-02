import { Injectable } from '@nestjs/common';
import { OutboxRepository, type OutboxEventEntity } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
@Injectable()
export class WalletOutboxRepository extends OutboxRepository {
  constructor(private readonly prisma: WalletPrismaService) { super(); }
  findPendingEvents(limit = 20, now = new Date()): Promise<OutboxEventEntity[]> { return this.prisma.outboxEvent.findMany({ where: { status: { in: ['pending','dlq_retry'] }, nextRetryAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take: limit }) as Promise<OutboxEventEntity[]>; }
  async markPublished(id: string, publishedAt = new Date()) { await this.prisma.outboxEvent.update({ where: { id }, data: { status: 'published', publishedAt } }); }
  async scheduleRetry(id: string, nextRetryAt: Date, retryCount: number, error: string) { await this.prisma.outboxEvent.update({ where: { id }, data: { retryCount, nextRetryAt, lastError: error } }); }
  async markFailed(id: string, error: string, retryCount?: number) { await this.prisma.outboxEvent.update({ where: { id }, data: { status: 'failed', lastError: error, ...(retryCount === undefined ? {} : { retryCount }) } }); }
  async scheduleDlqRetry(id: string, nextRetryAt: Date, error: string, retryCount?: number) { await this.prisma.outboxEvent.update({ where: { id }, data: { status: 'dlq_retry', nextRetryAt, lastError: error, ...(retryCount === undefined ? {} : { retryCount }) } }); }
}
