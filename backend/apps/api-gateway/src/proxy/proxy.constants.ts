import type { Request } from 'express';

export interface ServiceRouteConfig {
  upstreamName: string;
  envKey: string;
  prefixes: readonly string[];
  pathRewrite?: (path: string, req: Request) => string;
  timeoutEnvKey?: string;
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
    prefixes: ['/api/v1/users'],
  },
  {
    upstreamName: 'ai-service',
    envKey: 'AI_SERVICE_URL',
    prefixes: ['/api/v1/identity', '/api/v1/admin/identity'],
    timeoutEnvKey: 'AI_SERVICE_TIMEOUT_MS',
    pathRewrite: (path, req) => {
      const userId = req.headers['x-user-id'];
      const queryIndex = path.indexOf('?');
      const query = queryIndex >= 0 ? path.slice(queryIndex) : '';
      const cleanPath = queryIndex >= 0 ? path.slice(0, queryIndex) : path;

      if (cleanPath === '/api/v1/identity/verify') {
        return typeof userId === 'string' && userId
          ? `/api/identity/${encodeURIComponent(userId)}/verify${query}`
          : `/api/identity/verify${query}`;
      }

      if (cleanPath.startsWith('/api/v1/identity/jobs')) {
        const sub = cleanPath.replace('/api/v1/identity/jobs', '/api/identity/jobs');
        return `${sub}${query}`;
      }

      if (cleanPath.startsWith('/api/v1/identity/verify/')) {
        const sub = cleanPath.replace('/api/v1/identity/verify/', '/api/identity/verify/');
        return `${sub}${query}`;
      }

      if (cleanPath.startsWith('/api/v1/admin/identity')) {
        return `${cleanPath}${query}`;
      }

      return path.replace(/^\/api\/v1\/identity/, '/api/identity');
    },
  },
  {
    upstreamName: 'catalog-service',
    envKey: 'CATALOG_SERVICE_URL',
    prefixes: ['/api/v1/catalog', '/api/v1/categories'],
  },
  {
    upstreamName: 'order-service',
    envKey: 'ORDER_SERVICE_URL',
    prefixes: ['/api/v1/orders'],
  },
  {
    upstreamName: 'bidding-service',
    envKey: 'BIDDING_SERVICE_URL',
    prefixes: [ '/api/v1/bids'],
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
