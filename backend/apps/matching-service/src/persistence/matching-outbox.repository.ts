import { Injectable } from '@nestjs/common';
import { MatchingPrismaService, MatchingPrisma } from '@app/database';

@Injectable()
export class MatchingOutboxRepository {
  constructor(private readonly prisma: MatchingPrismaService) {}

  /**
   * Finds pending unpublished outbox events.
   */
  async findPendingEvents(limit = 20): Promise<MatchingPrisma.OutboxEvent[]> {
    return this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Marks an outbox event as successfully published.
   */
  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        publishedAt: new Date(),
      },
    });
  }

  /**
   * Increments publish attempt count for an event that encountered an error.
   */
  async incrementPublishAttempts(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        publishAttempts: { increment: 1 },
      },
    });
  }
}
