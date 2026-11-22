import { Controller, Logger, Optional } from '@nestjs/common';
import { EventPattern, Payload, Ctx } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import { DisputeRefundReconciliationService } from '../common/inbox/dispute-refund-reconciliation.service.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';

export interface PaymentEventPayload {
  eventId?: string;
  orderId?: string;
  payload?: {
    orderId?: string;
    paymentId?: string;
    amount?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

@Controller()
export class PaymentEventsConsumer {
  private readonly logger = new Logger(PaymentEventsConsumer.name);
  private readonly disputeReconciliation: DisputeRefundReconciliationService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consumedEventRepo: ConsumedEventRepository,
    @Optional() private readonly outbox?: OrderOutboxRepository,
    @Optional() disputeReconciliation?: DisputeRefundReconciliationService,
  ) {
    this.disputeReconciliation =
      disputeReconciliation ??
      new DisputeRefundReconciliationService(prisma, consumedEventRepo, outbox);
  }

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED)
  async handleDisputeRefundCompleted(
    @Payload() data: unknown,
    @Ctx() context?: any,
  ): Promise<void> {
    await this.processDisputeRefund('completed', data, context);
  }

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW)
  async handleDisputeRefundNeedsReview(
    @Payload() data: unknown,
    @Ctx() context?: any,
  ): Promise<void> {
    await this.processDisputeRefund('needs_review', data, context);
  }

  private async processDisputeRefund(
    kind: 'completed' | 'needs_review',
    raw: unknown,
    context?: any,
  ): Promise<void> {
    try {
      const result =
        await this.disputeReconciliation.processDisputeRefundEvent(kind, raw);
      if (result.outcome === 'malformed') {
        this.logger.warn(
          `Rejected malformed dispute refund event (${kind}); NACK without requeue`,
        );
        this.nackMessage(context, false);
        return;
      }
      if (result.outcome === 'mismatched') {
        this.logger.warn(
          `Parked mismatched dispute refund event (${kind}) [${result.classification}/${result.reasonCode}]: ${result.reasonDetail}`,
        );
      }
      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to process dispute refund ${kind}: ${(error as Error).message}`,
      );
      this.nackMessage(context, true);
      throw error;
    }
  }

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
