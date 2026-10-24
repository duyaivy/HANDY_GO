import { Injectable } from '@nestjs/common';
import { MatchingPrismaService } from '@app/database';

@Injectable()
export class ConsumedEventRepository {
  constructor(private readonly prisma: MatchingPrismaService) {}

  async isEventConsumed(eventId: string): Promise<boolean> {
    const existing = await this.prisma.consumedEvent.findUnique({
      where: { eventId },
    });
    return !!existing;
  }

  async markEventConsumed(
    eventId: string,
    eventType: string,
    tx?: any,
  ): Promise<void> {
    const client = tx || this.prisma;
    await client.consumedEvent.upsert({
      where: { eventId },
      update: {},
      create: {
        eventId,
        eventType,
        consumedAt: new Date(),
      },
    });
  }
}
