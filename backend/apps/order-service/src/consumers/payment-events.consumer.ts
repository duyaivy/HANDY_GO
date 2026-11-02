import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';

export interface PaymentEventPayload {
  eventId?: string;
  orderId?: string;
  payload?: {
    orderId?: string;
    amount?: number | string;
    transactionId?: string;
    failureReason?: string;
  };
}

@Controller()
export class PaymentEventsConsumer {
  private readonly logger = new Logger(PaymentEventsConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consumedEventRepo: ConsumedEventRepository,
  ) {}

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED)
  async handlePaymentSucceeded(
    @Payload() data: PaymentEventPayload,
    @Ctx() context?: any,
  ): Promise<void> {
    await this.processPaymentEvent(
      ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED,
      'paid',
      data,
      context,
    );
  }

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: PaymentEventPayload,
    @Ctx() context?: any,
  ): Promise<void> {
    await this.processPaymentEvent(
      ORDER_CONSTANTS.EVENT_PAYMENT_FAILED,
      'failed',
      data,
      context,
    );
  }

  private async processPaymentEvent(
    eventType: string,
    targetPaymentState: 'paid' | 'failed',
    data: PaymentEventPayload,
    context?: any,
  ): Promise<void> {
    const eventId = data?.eventId ?? (data as any)?.id;
    const orderId = data?.payload?.orderId ?? data?.orderId;

    if (!eventId || !orderId) {
      this.logger.warn(
        `Received ${eventType} without valid eventId (${eventId}) or orderId (${orderId}), rejecting without requeue`,
      );
      this.nackMessage(context, false);
      return;
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const isNew = await this.consumedEventRepo.recordEventIfNew(
          eventId,
          eventType,
          tx,
        );

        if (!isNew) {
          return { duplicate: true };
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentState: targetPaymentState,
          },
        });

        return { duplicate: false };
      });

      if (result.duplicate) {
        this.logger.debug(
          `Duplicate ${eventType} event ${eventId} skipped`,
        );
        this.ackMessage(context);
        return;
      }

      this.logger.log(
        `Order ${orderId} projection updated to paymentState: ${targetPaymentState}`,
      );
      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to process ${eventType} for order ${orderId}: ${(error as Error).message}`,
      );
      this.nackMessage(context, true);
      throw error;
    }
  }

  private ackMessage(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
    }
  }

  private nackMessage(context: any, requeue = true): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        channel.nack(originalMsg, false, requeue);
      }
    }
  }
}
