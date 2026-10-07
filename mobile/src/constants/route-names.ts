/**
 * Centralized Route Names for Expo Router.
 * Base routes for HANDY_GO Mobile foundation.
 */
export const RouteNames = {
  ROOT: '/',
  AUTH_LOGIN: '/(auth)/login',
  LOGIN: '/login',
  AUTH_REGISTER: '/(auth)/register',
  REGISTER: '/register',
  AUTH_OTP: '/(auth)/otp',
  OTP: '/otp',
  CUSTOMER: '/customer',
  CUSTOMER_HOME: '/customer',
  CUSTOMER_ORDERS: '/customer/orders',
  CUSTOMER_ORDER_DETAIL: (id: string) => `/customer/orders/${id}` as const,
  CUSTOMER_PROFILE: '/customer/profile',
  CUSTOMER_PROFILE_DETAIL: '/customer/profile/detail',
  WORKER: '/worker',
  WORKER_HOME: '/worker',
  WORKER_JOBS: '/worker/jobs',
  WORKER_PROFILE: '/worker/profile',
  WORKER_PROFILE_DETAIL: '/worker/profile/detail',
} as const;

export type RoutePath
  = | Exclude<typeof RouteNames[keyof typeof RouteNames], (...args: any[]) => any>
    | ReturnType<typeof RouteNames.CUSTOMER_ORDER_DETAIL>;
