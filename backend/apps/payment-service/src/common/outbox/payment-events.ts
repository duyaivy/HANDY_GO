import type { Prisma } from '@prisma/payment-client';

export const PAYMENT_SOURCE = 'payment-service';

export type PaymentTx = Prisma.TransactionClient;

export interface OutboxEventInput {
  aggregateType: 'payment' | 'refund' | 'topup' | 'payout';
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

interface PaymentEventSubject {
  id: string;
  orderId: string;
  customerUserId: string;
  workerUserId: string;
  amount: bigint;
  platformFee: bigint;
  workerEarning: bigint;
  method: string | null;
  paidAt: Date | null;
}

// Contract shared with Order (orderId/payload.orderId) and Notification (paymentId/payerId).
function paymentBase(payment: PaymentEventSubject) {
  return {
    source: PAYMENT_SOURCE,
    paymentId: payment.id,
    orderId: payment.orderId,
    payerId: payment.customerUserId,
    customerUserId: payment.customerUserId,
    workerUserId: payment.workerUserId,
    amount: payment.amount.toString(),
    currency: 'VND',
  };
}

export function paymentSucceededEvent(payment: PaymentEventSubject): OutboxEventInput {
  return {
    aggregateType: 'payment',
    aggregateId: payment.id,
    eventType: 'payment.succeeded',
    payload: {
      ...paymentBase(payment),
      method: payment.method,
      platformFee: payment.platformFee.toString(),
      workerEarning: payment.workerEarning.toString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
    },
  };
}

export function paymentFailedEvent(payment: PaymentEventSubject, failureReason: string): OutboxEventInput {
  return {
    aggregateType: 'payment',
    aggregateId: payment.id,
    eventType: 'payment.failed',
    payload: { ...paymentBase(payment), method: payment.method, failureReason },
  };
}

export function paymentCancelledEvent(payment: PaymentEventSubject): OutboxEventInput {
  return {
    aggregateType: 'payment',
    aggregateId: payment.id,
    eventType: 'payment.cancelled',
    payload: paymentBase(payment),
  };
}

export function paymentRefundedEvent(
  payment: PaymentEventSubject,
  refund: { id: string; amountVnd: bigint },
): OutboxEventInput {
  return {
    aggregateType: 'refund',
    aggregateId: refund.id,
    eventType: 'payment.refunded',
    payload: {
      ...paymentBase(payment),
      refundId: refund.id,
      recipientId: payment.customerUserId,
      refundAmount: refund.amountVnd.toString(),
    },
  };
}

// Wallet's top-up consumer reads these fields from the message root while the shared
// outbox publisher also exposes `data`/`payload`; both shapes are kept intentionally.
export function topupSucceededEvent(topup: {
  id: string;
  userId: string;
  pointsToCredit: bigint;
  idempotencyKey: string;
}): OutboxEventInput {
  const business = {
    userId: topup.userId,
    paymentId: topup.id,
    topupId: topup.id,
    amount: topup.pointsToCredit.toString(),
    idempotencyKey: topup.idempotencyKey,
  };
  return {
    aggregateType: 'topup',
    aggregateId: topup.id,
    eventType: 'payment.topup.succeeded',
    payload: { ...business, source: PAYMENT_SOURCE, producer: PAYMENT_SOURCE, data: business },
  };
}
