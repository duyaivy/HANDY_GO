import type { Request } from 'express';

export interface ServiceRouteConfig {
  upstreamName: string;
  envKey: string;
  prefixes: readonly string[];
  pathRewrite?: (path: string, req: Request) => string;
  timeoutEnvKey?: string;
  customMatch?: (pathname: string) => boolean;
}

export const SERVICE_ROUTES: readonly ServiceRouteConfig[] = [
  {
    upstreamName: 'auth-service',
    envKey: 'AUTH_SERVICE_URL',
    prefixes: ['/api/v1/auth'],
  },
  {
    upstreamName: 'user-trust-service',
    envKey: 'USER_TRUST_SERVICE_URL',
    prefixes: ['/api/v1/users', '/api/v1/admin/kyc-cases'],
  },
  {
    upstreamName: 'ai-service',
    envKey: 'AI_SERVICE_URL',
    prefixes: [
      '/api/v1/ocr',
      '/ocr',
    ],
    timeoutEnvKey: 'AI_SERVICE_TIMEOUT_MS',
  },
  {
    upstreamName: 'catalog-service',
    envKey: 'CATALOG_SERVICE_URL',
    prefixes: ['/api/v1/catalog', '/api/v1/categories', '/api/v1/services'],
  },
  {
    upstreamName: 'bidding-service',
    envKey: 'BIDDING_SERVICE_URL',
    prefixes: ['/api/v1/bids'],
    customMatch: (pathname: string) =>
      pathname === '/api/v1/bids' ||
      pathname.startsWith('/api/v1/bids/') ||
      pathname.startsWith('/api/v1/bids?') ||
      /^\/api\/v1\/requests\/[^/?#]+\/(bids|bidding-status)(\/.*)?(\?.*)?$/.test(
        pathname,
      ),
  },
  {
    upstreamName: 'order-service',
    envKey: 'ORDER_SERVICE_URL',
    prefixes: ['/api/v1/orders', '/api/v1/requests'],
  },
  {
    upstreamName: 'matching-service',
    envKey: 'MATCHING_SERVICE_URL',
    prefixes: ['/api/v1/matching'],
  },
  {
    upstreamName: 'payment-service',
    envKey: 'PAYMENT_SERVICE_URL',
    prefixes: ['/api/v1/payments'],
  },
  {
    upstreamName: 'notification-service',
    envKey: 'NOTIFICATION_SERVICE_URL',
    prefixes: ['/api/v1/notifications'],
  },
  {
    upstreamName: 'wallet-service',
    envKey: 'WALLET_SERVICE_URL',
    prefixes: ['/api/v1/wallets'],
  },
  {
    upstreamName: 'tracking-service',
    envKey: 'TRACKING_SERVICE_URL',
    prefixes: ['/api/v1/tracking'],
  },
] as const;

export const UPSTREAM_SERVICE_URLS = SERVICE_ROUTES.map(
  (route) => route.envKey,
);
