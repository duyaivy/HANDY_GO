import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OutboxRepository, type OutboxEventEntity } from '@app/common';
import type { Prisma } from '@prisma/order-client';

export interface CreateOutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion?: number;
  payload: Record<string, unknown> | unknown;
}

@Injectable()
export class OrderOutboxRepository extends OutboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createEvent(
    data: CreateOutboxEventInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.outboxEvent.create({
      data: {
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        eventType: data.eventType,
        eventVersion: data.eventVersion ?? 1,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });
  }

  async findPendingEvents(
    limit = 20,
    now = new Date(),
  ): Promise<OutboxEventEntity[]> {
    return this.prisma.outboxEvent.findMany({
      where: {
        status: { in: ['pending', 'dlq_retry'] },
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
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
        ...(retryCount !== undefined ? { retryCount } : {}),
        nextRetryAt,
        lastError: error,
      },
    });
  }
}
