import { HttpStatus } from '@nestjs/common';
import type { AttemptStatus, PaymentStatus } from '@prisma/payment-client';
import { AppException, ERROR_CODES } from '@app/common';

// `partially_refunded` is deliberately not reachable yet: it needs a downstream
// compatibility decision with Order/Notification (see README, PR questions).
const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['processing', 'succeeded', 'cancelled'],
  processing: ['succeeded', 'failed'],
  failed: ['processing', 'succeeded', 'cancelled'],
  succeeded: ['refunded'],
  partially_refunded: ['refunded'],
  cancelled: [],
  refunded: [],
};

const ATTEMPT_TRANSITIONS: Record<AttemptStatus, readonly AttemptStatus[]> = {
  pending: ['processing', 'succeeded', 'failed', 'cancelled'],
  processing: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, `Payment cannot move from ${from} to ${to}`);
  }
}

export function assertAttemptTransition(from: AttemptStatus, to: AttemptStatus): void {
  if (!ATTEMPT_TRANSITIONS[from].includes(to)) {
    throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, `Payment attempt cannot move from ${from} to ${to}`);
  }
}
