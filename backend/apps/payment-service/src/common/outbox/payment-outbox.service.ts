import { Injectable } from '@nestjs/common';
import { PaymentPrismaService } from '../database/payment-prisma.service.js';
import type { OutboxEventInput, PaymentTx } from './payment-events.js';

@Injectable()
export class PaymentOutboxService {
  constructor(private readonly database: PaymentPrismaService) {}

  // Must be called inside the same transaction that changes the business state.
  async enqueue(tx: PaymentTx | undefined, event: OutboxEventInput): Promise<void> {
    await (tx ?? this.database.client).outboxEvent.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        eventVersion: 1,
        payload: event.payload as object,
      },
    });
  }
}
