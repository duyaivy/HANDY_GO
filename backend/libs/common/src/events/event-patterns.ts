export const EVENT_PATTERNS = {
  USER_REGISTERED: 'user.registered',
  USER_SUSPENDED: 'user.suspended',
  USER_DELETED: 'user.deleted',

  KYC_SUBMITTED: 'kyc.submitted',
  KYC_COMPLETED: 'kyc.completed',
  KYC_FAILED: 'kyc.failed',

  ORDER_CREATED: 'order.created',
  ORDER_ACCEPTED: 'order.accepted',
  ORDER_STARTED: 'order.started',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',

  BID_CREATED: 'bid.created',
  BID_ACCEPTED: 'bid.accepted',
  BID_REJECTED: 'bid.rejected',

  WORKER_MATCHED: 'worker.matched',

  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUND_REQUESTED: 'payment.refund.requested',
  PAYMENT_REFUND_COMPLETED: 'payment.refund.completed',

  WALLET_UPDATED: 'wallet.updated',
} as const;