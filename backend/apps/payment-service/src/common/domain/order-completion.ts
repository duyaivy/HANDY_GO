import type { Payment } from '@prisma/payment-client';
import {
  paymentPendingEvent,
  type PaymentTx,
} from '../outbox/payment-events.js';
import type { PaymentOutboxService } from '../outbox/payment-outbox.service.js';

// Caller must hold the Payment row lock. Completion and its event commit together.
export async function markOrderCompleted(
  tx: PaymentTx,
  payment: Payment,
  completedAt: Date,
  outbox: PaymentOutboxService,
): Promise<void> {
  if (
    payment.orderCompletedAt ||
    !['pending', 'failed'].includes(payment.status)
  )
    return;
  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: { orderCompletedAt: completedAt },
  });
  await outbox.enqueue(tx, paymentPendingEvent(updated));
}
