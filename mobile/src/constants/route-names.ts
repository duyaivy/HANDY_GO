/**
 * Centralized Route Names for Expo Router.
 * Base routes for HANDY_GO Mobile foundation.
 */
export const RouteNames = {
  ROOT: '/',
  AUTH_LOGIN: '/(auth)/login',
  LOGIN: '/login',
  CUSTOMER: '/customer',
  CUSTOMER_HOME: '/customer',
  CUSTOMER_ORDERS: '/customer/orders',
  CUSTOMER_ORDER_DETAIL: (id: string) => `/customer/orders/${id}` as const,
  CUSTOMER_PROFILE: '/customer/profile',
  WORKER: '/worker',
  WORKER_HOME: '/worker',
  WORKER_JOBS: '/worker/jobs',
  WORKER_PROFILE: '/worker/profile',
} as const;

export type RoutePath
  = | Exclude<typeof RouteNames[keyof typeof RouteNames], (...args: any[]) => any>
    | ReturnType<typeof RouteNames.CUSTOMER_ORDER_DETAIL>;
