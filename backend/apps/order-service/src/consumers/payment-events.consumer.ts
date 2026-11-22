import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { isUUID } from 'class-validator';

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
    @Optional() private readonly outbox?: OrderOutboxRepository,
  ) {}

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED)
  async handleDisputeRefundCompleted(@Payload() data: unknown, @Ctx() context?: any): Promise<void> {
    await this.processDisputeRefund('completed', data, context);
  }

  @EventPattern(ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW)
  async handleDisputeRefundNeedsReview(@Payload() data: unknown, @Ctx() context?: any): Promise<void> {
    await this.processDisputeRefund('needs_review', data, context);
  }

  private async processDisputeRefund(kind: 'completed' | 'needs_review', raw: unknown, context?: any): Promise<void> {
    const envelope = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const body = (envelope.data ?? envelope.payload ?? envelope) as Record<string, unknown>;
    const eventId = envelope.eventId ?? envelope.id;
    const resolutionId = body?.resolutionId;
    const orderId = body?.orderId;
    const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : '';
    if (!normalizedEventId || !isUUID(String(resolutionId)) || !isUUID(String(orderId))) {
      this.logger.warn(
        `Rejected malformed dispute refund event (${kind}): eventId=${String(eventId)}, resolutionId=${String(resolutionId)}, orderId=${String(orderId)}`,
      );
      this.nackMessage(context, false);
      return;
    }
    const eventType = kind === 'completed' ? ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED : ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM order_service.orders WHERE id = ${orderId}::uuid FOR UPDATE`;
        const resolution = await tx.orderDisputeResolution.findUnique({ where: { id: resolutionId as string } });
        const order = await tx.order.findUnique({ where: { id: orderId as string } });
        if (!resolution || !order) {
          this.logger.warn(
            `Ignoring ${eventType} (eventId=${normalizedEventId}): missing resolution=${Boolean(resolution)} or order=${Boolean(order)} (resolutionId=${String(resolutionId)}, orderId=${String(orderId)})`,
          );
          return;
        }
        const isNew = await this.consumedEventRepo.recordEventIfNew(normalizedEventId, eventType, tx);
        if (!isNew) return;
        if (
          resolution.orderId !== orderId ||
          resolution.action !== 'refund' ||
          resolution.paymentId !== body.paymentId ||
          !['refund_pending', 'needs_review'].includes(resolution.state)
        ) {
          this.logger.warn(
            `Ignored ${eventType} (eventId=${normalizedEventId}): resolution mismatch or non-pending state ` +
              `(resolutionId=${resolution.id}, orderId=${orderId}, expectedPaymentId=${resolution.paymentId}, actualPaymentId=${String(body.paymentId)}, state=${resolution.state}, action=${resolution.action})`,
          );
          return;
        }
        if (kind === 'needs_review') {
          await tx.orderDisputeResolution.update({
            where: { id: resolution.id },
            data: {
              state: 'needs_review',
              failureCode:
                typeof body.failureCode === 'string'
                  ? body.failureCode.slice(0, ORDER_CONSTANTS.MAX_FAILURE_CODE_LENGTH)
                  : 'PAYMENT_REVIEW_REQUIRED',
            },
          });
          return;
        }
        const expectedAmount = resolution.refundAmountVnd?.toString();
        if (
          order.status !== 'disputed' ||
          !isUUID(String(body.refundId)) ||
          !['partially_refunded', 'refunded'].includes(String(body.paymentStatus)) ||
          body.refundAmountVnd !== expectedAmount
        ) {
          this.logger.warn(
            `Ignored ${eventType} (eventId=${normalizedEventId}): completion guard failed ` +
              `(resolutionId=${resolution.id}, orderId=${order.id}, orderStatus=${order.status}, refundId=${String(body.refundId)}, paymentStatus=${String(body.paymentStatus)}, expectedAmount=${String(expectedAmount)}, actualAmount=${String(body.refundAmountVnd)})`,
          );
          return;
        }
        const now = new Date();
        const changed = await tx.order.updateMany({ where: { id: order.id, status: 'disputed', version: order.version }, data: {
          status: 'completed', paymentState: body.paymentStatus as 'partially_refunded' | 'refunded',
          disputeResolvedAt: now, version: { increment: 1 },
        } });
        if (changed.count !== 1) throw new Error('Order changed concurrently during dispute refund completion');
        await tx.orderDisputeResolution.update({ where: { id: resolution.id }, data: {
          state: 'completed', refundId: body.refundId as string, failureCode: null, resolvedAt: now,
        } });
        await tx.orderStatusHistory.create({ data: {
          orderId: order.id, fromStatus: 'disputed', toStatus: 'completed', changedByUserId: resolution.adminUserId,
          reason: resolution.resolutionNote,
        } });
        if (!this.outbox) throw new Error('Order outbox is unavailable');
        const payload = { resolutionId: resolution.id, orderId: order.id, orderCode: order.orderCode,
          action: 'refund', customerUserId: order.customerUserId, workerUserId: order.workerUserId,
          paymentId: body.paymentId, refundId: body.refundId, refundAmountVnd: body.refundAmountVnd,
          paymentStatus: body.paymentStatus, resolvedStatus: 'completed', resolvedAt: now.toISOString() };
        await this.outbox.createEvent({ aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER, aggregateId: order.id,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED, payload: {
            previousStatus: 'disputed', nextStatus: 'completed', notificationKind: 'status_update',
            customerId: order.customerUserId, workerId: order.workerUserId, ...payload,
          } }, tx);
        await this.outbox.createEvent({ aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER, aggregateId: order.id,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_RESOLVED, payload }, tx);
      });
      this.ackMessage(context);
    } catch (error) {
      this.logger.error(`Failed to process dispute refund ${kind}: ${(error as Error).message}`);
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
