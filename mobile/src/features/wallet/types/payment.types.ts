export type TopupStatus
  = | 'pending'
    | 'awaiting_payment'
    | 'paid'
    | 'credit_pending'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'expired'
    | 'needs_review';

export type TopupRecord = {
  id: string;
  amountVnd: string;
  pointsToCredit: string;
  provider: 'vnpay' | 'mock';
  isSimulated: boolean;
  simulationEndpoint: string | null;
  status: TopupStatus;
  checkoutUrl: string | null;
  providerPaidAt: string | null;
  walletCreditedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export type CreateTopupPayload = {
  amountVnd: number;
  idempotencyKey: string;
};

export type PaginatedTopups = {
  items: TopupRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaymentMethod = 'point' | 'cash';

export type OrderPaymentStatus
  = | 'pending'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'partially_refunded'
    | 'refunded';

export type OrderPaymentRecord = {
  id: string;
  orderId: string;
  customerUserId: string;
  workerUserId: string;
  amount: string;
  currency: string;
  method: PaymentMethod | null;
  status: OrderPaymentStatus;
  platformFee: string;
  workerEarning: string;
  orderCompletedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrderPaymentPayload = {
  orderId: string;
  method: PaymentMethod;
  expectedAmount?: string;
};
