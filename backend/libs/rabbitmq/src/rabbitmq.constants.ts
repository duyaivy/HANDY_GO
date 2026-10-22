export const RABBITMQ_EXCHANGE = 'handy-go.events';

export const RABBITMQ_QUEUES = {
  AUTH: 'auth-service',
  USER_TRUST: 'user-trust-service',
  KYC_WORKER: 'user-trust-kyc-worker',
  KYC_DLQ: 'user-trust-kyc-worker.dlq',
  CATALOG: 'catalog-service',
  ORDER: 'order-service',
  BIDDING: 'bidding-service',
  MATCHING: 'matching-service',
  PAYMENT: 'payment-service',
  NOTIFICATION: 'notification-service',
  WALLET: 'wallet-service',
  TRACKING: 'tracking-service',
} as const;
