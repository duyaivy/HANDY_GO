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
    const eventId =
      data?.eventId ??
      (data as any)?.id ??
      `payment_succeeded_${Date.now()}`;
    const orderId = data?.payload?.orderId ?? data?.orderId;

    if (!orderId) {
      this.logger.warn(
        `Received ${ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED} without orderId, skipping`,
      );
      this.ackMessage(context);
      return;
    }

    const isNew = await this.consumedEventRepo.recordEventIfNew(
      eventId,
      ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED,
    );

    if (!isNew) {
      this.logger.debug(
        `Duplicate ${ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED} event ${eventId} skipped`,
      );
      this.ackMessage(context);
      return;
    }

    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentState: 'paid',
        },
      });

      this.logger.log(
        `Order ${orderId} projection updated to paymentState: paid`,
      );
      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to update paymentState for order ${orderId}: ${(error as Error).message}`,
      );
      this.nackMessage(context);
      throw error;
    }
  }

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: PaymentEventPayload,
    @Ctx() context?: any,
  ): Promise<void> {
    const eventId =
      data?.eventId ??
      (data as any)?.id ??
      `payment_failed_${Date.now()}`;
    const orderId = data?.payload?.orderId ?? data?.orderId;

    if (!orderId) {
      this.logger.warn(
        `Received ${ORDER_CONSTANTS.EVENT_PAYMENT_FAILED} without orderId, skipping`,
      );
      this.ackMessage(context);
      return;
    }

    const isNew = await this.consumedEventRepo.recordEventIfNew(
      eventId,
      ORDER_CONSTANTS.EVENT_PAYMENT_FAILED,
    );

    if (!isNew) {
      this.logger.debug(
        `Duplicate ${ORDER_CONSTANTS.EVENT_PAYMENT_FAILED} event ${eventId} skipped`,
      );
      this.ackMessage(context);
      return;
    }

    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentState: 'failed',
        },
      });

      this.logger.log(
        `Order ${orderId} projection updated to paymentState: failed`,
      );
      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to update paymentState for order ${orderId}: ${(error as Error).message}`,
      );
      this.nackMessage(context);
      throw error;
    }
  }

  private ackMessage(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
    }
  }

  private nackMessage(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      if (channel && originalMsg) {
        channel.nack(originalMsg, false, true);
      }
    }
  }
}
