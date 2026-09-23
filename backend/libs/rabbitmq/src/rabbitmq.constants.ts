export const RABBITMQ_EXCHANGE = 'handy-go.events';

export const RABBITMQ_QUEUES = {
  AUTH: 'auth-service',
  USER_TRUST: 'user-trust-service',
  CATALOG: 'catalog-service',
  ORDER: 'order-service',
  BIDDING: 'bidding-service',
  MATCHING: 'matching-service',
  PAYMENT: 'payment-service',
  NOTIFICATION: 'notification-service',
  WALLET: 'wallet-service',
  TRACKING: 'tracking-service',
} as const;