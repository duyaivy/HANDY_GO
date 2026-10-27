import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Prisma } from '@prisma/order-client';

@Injectable()
export class ConsumedEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isEventConsumed(
    eventId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const found = await client.consumedEvent.findUnique({
      where: { eventId },
      select: { eventId: true },
    });
    return !!found;
  }

  async markEventConsumed(
    eventId: string,
    eventType: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.consumedEvent.create({
      data: {
        eventId,
        eventType,
      },
    });
  }

  /**
   * Attempts to record an event atomically.
   * Returns true if event was newly recorded (not processed before).
   * Returns false if event was already consumed (duplicate).
   */
  async recordEventIfNew(
    eventId: string,
    eventType: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    try {
      await client.consumedEvent.create({
        data: {
          eventId,
          eventType,
        },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  async deleteEvent(
    eventId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.consumedEvent.deleteMany({
      where: { eventId },
    });
  }
}
