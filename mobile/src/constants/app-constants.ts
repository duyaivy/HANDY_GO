/**
 * Global application constants & Backend Microservices Enums.
 */

export const AppConstants = {
  APP_NAME: 'HANDY GO',
  API_TIMEOUT_MS: 15000,
  DEFAULT_PAGE_SIZE: 10,
  MAX_UPLOAD_IMAGE_SIZE_MB: 5,
  MAX_UPLOAD_IMAGES_COUNT: 5,
  SUPPORT_PHONE: '1900-1234',
  SUPPORT_EMAIL: 'hotro@handygo.vn',
  DEFAULT_COORDINATES: {
    latitude: 16.0544,
    longitude: 108.2022, // Đà Nẵng
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  },
} as const;

// 1. AuthService Enums
export const ACCOUNT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  LOCKED: 'locked',
  DELETED: 'deleted',
} as const;

export const OTP_PURPOSE = {
  REGISTER: 'register',
  VERIFY_EMAIL: 'verify_email',
  VERIFY_PHONE: 'verify_phone',
  RESET_PASSWORD: 'reset_password',
} as const;

// 2. User & Trust Service Enums
export const USER_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const;

export const WORKER_STATUS = {
  DRAFT: 'draft',
  PENDING_KYC: 'pending_kyc',
  UNDER_REVIEW: 'under_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
} as const;

export const KYC_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWING: 'reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const REVIEW_STATUS = {
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  FLAGGED: 'flagged',
  REMOVED: 'removed',
} as const;

export const COMPLAINT_CATEGORY = {
  SERVICE_QUALITY: 'service_quality',
  WORKER_BEHAVIOR: 'worker_behavior',
  CUSTOMER_BEHAVIOR: 'customer_behavior',
  PAYMENT: 'payment',
  FRAUD: 'fraud',
  SAFETY: 'safety',
  OTHER: 'other',
} as const;

export const COMPLAINT_STATUS = {
  SUBMITTED: 'submitted',
  REVIEWING: 'reviewing',
  AWAITING_INFORMATION: 'awaiting_information',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CLOSED: 'closed',
} as const;

// 3. OrderService Enums
export const REQUEST_STATUS = {
  DRAFT: 'draft',
  OPEN_FOR_BIDDING: 'open_for_bidding',
  BIDDING_CLOSED: 'bidding_closed',
  MATCHING_FALLBACK: 'matching_fallback',
  CONVERTED_TO_ORDER: 'converted_to_order',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export const ORDER_STATUS = {
  CREATED: 'created',
  AWAITING_PAYMENT: 'awaiting_payment',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',

  // Legacy mappings for backward compatibility
  PENDING_BIDS: 'PENDING_BIDS',
  BID_RECEIVED: 'BID_RECEIVED',
  WORKER_ACCEPTED: 'WORKER_ACCEPTED',
  IN_TRANSIT: 'IN_TRANSIT',
  IN_PROGRESS: 'IN_PROGRESS',
} as const;

export const PAYMENT_STATE = {
  UNPAID: 'unpaid',
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
} as const;

// 4. BiddingService Enums
export const ROUND_STATUS = {
  PENDING: 'pending',
  OPEN: 'open',
  CLOSED: 'closed',
  SELECTED: 'selected',
  NO_BID: 'no_bid',
  CANCELLED: 'cancelled',
} as const;

export const BID_STATUS = {
  ACTIVE: 'active',
  REVISED: 'revised',
  WITHDRAWN: 'withdrawn',
  SELECTED: 'selected',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

// 5. TrackingService Enums
export const TRACKING_STATUS = {
  PENDING: 'pending',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// 6. PaymentService Enums
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',

  // Legacy
  SUCCESS: 'SUCCESS',
} as const;

export const PAYMENT_METHOD = {
  CASH: 'cash',
  POINT: 'point',
} as const;

export const LEDGER_ENTRY_TYPE = {
  TOPUP: 'topup',
  PAYMENT_DEBIT: 'payment_debit',
  REFUND_CREDIT: 'refund_credit',
  ADJUSTMENT_CREDIT: 'adjustment_credit',
  ADJUSTMENT_DEBIT: 'adjustment_debit',
} as const;

// 7. WalletService Enums
export const WALLET_TRANSACTION_TYPE = {
  DEPOSIT: 'deposit',
  PAYMENT: 'payment',
  EARNING: 'earning',
  REFUND: 'refund',
  WITHDRAWAL: 'withdrawal',
  ADJUSTMENT: 'adjustment',
} as const;

export const WALLET_TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const WITHDRAWAL_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

// 8. NotificationService Enums
export const NOTIFICATION_CHANNEL = {
  PUSH: 'push',
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
} as const;

export const NOTIFICATION_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SENT: 'sent',
  PARTIALLY_SENT: 'partially_sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

// 9. AIService Enums
export const INFERENCE_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export const FACE_VERIFICATION_DECISION = {
  MATCHED: 'matched',
  NOT_MATCHED: 'not_matched',
  MANUAL_REVIEW: 'manual_review',
} as const;
