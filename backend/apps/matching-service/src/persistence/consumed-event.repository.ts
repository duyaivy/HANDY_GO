import { Injectable } from '@nestjs/common';
import { MatchingPrismaService } from '@app/database';

@Injectable()
export class ConsumedEventRepository {
  constructor(private readonly prisma: MatchingPrismaService) {}

  async isEventConsumed(eventId: string): Promise<boolean> {
    const existing = await this.prisma.consumedEvent.findUnique({
      where: { eventId },
    });
    if (existing) return true;
    const delivery = await this.prisma.eventDelivery.findUnique({
      where: { eventId },
    });
    return delivery?.deadLetter ?? false;
  }

  async recordFailure(
    eventId: string,
    eventType: string,
    payload: unknown,
    error: Error,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.eventDelivery.upsert({
        where: { eventId },
        create: {
          eventId,
          eventType,
          payload: JSON.parse(JSON.stringify(payload ?? null)),
          attempts: 1,
          lastError: error.message.slice(0, 2000),
        },
        update: {
          attempts: { increment: 1 },
          lastError: error.message.slice(0, 2000),
        },
      });
      if (delivery.attempts < 5) return false;
      await tx.eventDelivery.update({
        where: { eventId },
        data: { deadLetter: true },
      });
      return true;
    });
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
