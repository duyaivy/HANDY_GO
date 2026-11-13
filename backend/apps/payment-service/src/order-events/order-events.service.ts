import { markOrderCompleted } from '../common/domain/order-completion.js';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import { PermanentInboundError, RetryableInboundError, requireUuid } from '../common/inbound/inbound-event.js';
import { parseOrderAmount } from '../common/money/payment-money.js';
import { paymentCancelledEvent, type PaymentTx } from '../common/outbox/payment-events.js';
import { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import { CommissionRuleService } from '../commission-rules/commission-rule.service.js';

export const ORDER_CREATED = 'order.created';
export const ORDER_COMPLETED = 'order.completed';
export const ORDER_CANCELLED = 'order.cancelled';

export interface OrderEventData {
  orderId: string;
  customerUserId: string;
  workerUserId: string;
  amount: bigint;
  occurredAt: Date | null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseOrderEvent(data: Record<string, unknown>, timestampKey: string, requireAmount = true): OrderEventData {
  const customerUserId = requireUuid(data, 'customerUserId', 'customerId');
  const workerUserId = requireUuid(data, 'workerUserId', 'workerId');
  if (customerUserId === workerUserId) throw new PermanentInboundError('Customer and worker must be different users');
  let amount = 0n;
  if (requireAmount) {
    if (typeof data.agreedPrice !== 'string') throw new PermanentInboundError('agreedPrice is required');
    try {
      amount = parseOrderAmount(data.agreedPrice);
    } catch {
      throw new PermanentInboundError('agreedPrice must be an exact whole VND amount');
    }
    if (data.currency !== undefined && data.currency !== 'VND') throw new PermanentInboundError('Only VND is supported');
  }
  return {
    orderId: requireUuid(data, 'orderId'),
    customerUserId,
    workerUserId,
    amount,
    occurredAt: parseDate(data[timestampKey]),
  };
}

@Injectable()
export class OrderEventsService implements OnModuleInit {
  private readonly logger = new Logger(OrderEventsService.name);

  constructor(
    private readonly inbox: PaymentInboxService,
    private readonly commission: CommissionRuleService,
    private readonly outbox: PaymentOutboxService,
  ) {}

  onModuleInit(): void {
    this.inbox.register(ORDER_CREATED, (data, tx) => this.onCreated(data, tx));
    this.inbox.register(ORDER_COMPLETED, (data, tx) => this.onCompleted(data, tx));
    this.inbox.register(ORDER_CANCELLED, (data, tx) => this.onCancelled(data, tx));
  }

  // order.created only pre-creates the payment and snapshots the commission; it never charges.
  async onCreated(data: Record<string, unknown>, tx: PaymentTx): Promise<void> {
    const order = parseOrderEvent(data, 'createdAt');
    const existing = await tx.payment.findUnique({ where: { orderId: order.orderId } });
    if (existing) {
      if (existing.customerUserId !== order.customerUserId || existing.workerUserId !== order.workerUserId || existing.amount !== order.amount) {
        throw new PermanentInboundError('order.created contradicts the existing payment snapshot');
      }
      return;
    }
    const snapshot = await this.commission.snapshotFor(tx, order.amount, order.occurredAt ?? new Date());
    await tx.payment.create({
      data: {
        orderId: order.orderId,
        customerUserId: order.customerUserId,
        workerUserId: order.workerUserId,
        amount: order.amount,
        commissionRuleId: snapshot.commissionRuleId,
        commissionRatePercent: snapshot.commissionRatePercent,
        platformFee: snapshot.platformFee,
        workerEarning: snapshot.workerEarning,
      },
    });
  }

  // order.completed only opens the payment (stamps completion); the customer still has to pay.
  async onCompleted(data: Record<string, unknown>, tx: PaymentTx): Promise<void> {
    const order = parseOrderEvent(data, 'completedAt');
    await tx.$queryRaw`SELECT id FROM payment_service.payments WHERE order_id = ${order.orderId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { orderId: order.orderId } });
    if (!payment) throw new RetryableInboundError('Payment for the completed order is not created yet');
    if (payment.customerUserId !== order.customerUserId || payment.workerUserId !== order.workerUserId || payment.amount !== order.amount) {
      throw new PermanentInboundError('order.completed contradicts the payment snapshot');
    }
    if (!order.occurredAt) throw new PermanentInboundError('completedAt is required for order.completed');
    await markOrderCompleted(tx, payment, order.occurredAt, this.outbox);
  }

  async onCancelled(data: Record<string, unknown>, tx: PaymentTx): Promise<void> {
    const order = parseOrderEvent(data, 'cancelledAt', false);
    const payment = await tx.payment.findUnique({ where: { orderId: order.orderId } });
    if (!payment) throw new RetryableInboundError('Payment for the cancelled order is not created yet');
    if (payment.status === 'cancelled') return;
    if (payment.status === 'processing') throw new RetryableInboundError('Payment is being processed; cancellation deferred');
    if (!['pending', 'failed'].includes(payment.status)) {
      this.logger.warn(`order.cancelled ignored: payment ${payment.id} is already ${payment.status}`);
      return;
    }
    // Compare-and-set so a concurrent confirmation cannot be overwritten.
    const changed = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['pending', 'failed'] } },
      data: { status: 'cancelled' },
    });
    if (changed.count === 0) throw new RetryableInboundError('Payment changed concurrently; retry cancellation');
    await this.outbox.enqueue(tx, paymentCancelledEvent({ ...payment, method: payment.method }));
  }
}
