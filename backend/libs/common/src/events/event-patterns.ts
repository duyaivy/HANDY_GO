export const EVENT_PATTERNS = {
  USER_REGISTERED: 'user.registered',
  USER_SUSPENDED: 'user.suspended',
  USER_DELETED: 'user.deleted',
  AUTH_OTP_REQUESTED: 'auth.otp.requested',

  KYC_PENDING: 'kyc.pending',
  KYC_SUBMITTED: 'kyc.submitted',
  KYC_REVIEWING: 'kyc.reviewing',
  KYC_COMPLETED: 'kyc.completed',
  KYC_FAILED: 'kyc.failed',
  KYC_JOB_PROCESS: 'kyc.job.process',

  ORDER_CREATED: 'order.created',
  ORDER_ACCEPTED: 'order.accepted',
  ORDER_STARTED: 'order.started',
  ORDER_STATUS_CHANGED: 'order.status.changed',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',

  SERVICE_REQUEST_CREATED: 'service_request.created',
  SERVICE_REQUEST_PUBLISHED: 'service_request.published',
  SERVICE_REQUEST_CANCELLED: 'service_request.cancelled',
  SERVICE_REQUEST_EXPIRED: 'service_request.expired',
  SERVICE_REQUEST_CONVERTED_TO_ORDER: 'service_request.converted_to_order',

  MATCHING_STARTED: 'matching.started',
  MATCHING_COMPLETED: 'matching.completed',
  MATCHING_FAILED: 'matching.failed',

  BIDDING_ROUND_OPENED: 'bidding.round.opened',
  BIDDING_ROUND_CLOSED: 'bidding.round.closed',
  BIDDING_ROUND_FINALIZED: 'bidding.round.finalized',
  BIDDING_ROUND_EXTENDED: 'bidding.round.extended',
  BIDDING_ROUND_EXPIRE_CHECK: 'bidding.round.expire_check',
  BID_SUBMITTED: 'bid.submitted',
  BID_REVISED: 'bid.revised',
  BID_WITHDRAWN: 'bid.withdrawn',

  BOOKING_PROPOSAL_CREATED: 'booking_proposal.created',
  BOOKING_PROPOSAL_CHANGES_REQUESTED: 'booking_proposal.changes_requested',
  BOOKING_PROPOSAL_REJECTED: 'booking_proposal.rejected',
  BOOKING_PROPOSAL_WITHDRAWN: 'booking_proposal.withdrawn',
  BOOKING_PROPOSAL_FINALIZED: 'booking_proposal.finalized',

  BID_CREATED: 'bid.created',
  BID_ACCEPTED: 'bid.accepted',
  BID_REJECTED: 'bid.rejected',

  WORKER_MATCHED: 'worker.matched',

  PAYMENT_PENDING: 'payment.pending',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_REFUND_REQUESTED: 'payment.refund.requested',
  PAYMENT_REFUND_COMPLETED: 'payment.refund.completed',

  WALLET_UPDATED: 'wallet.updated',

  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_STATUS_CHANGED: 'category.status_changed',
  CATEGORY_DELETED: 'category.deleted',

  SERVICE_CREATED: 'service.created',
  SERVICE_UPDATED: 'service.updated',
  SERVICE_STATUS_CHANGED: 'service.status_changed',
  SERVICE_DELETED: 'service.deleted',
} as const;
