/**
 * Centralized Route Names for Expo Router.
 * Base routes for HANDY_GO Mobile foundation.
 */
export const RouteNames = {
  ROOT: '/',
} as const;

export type RoutePath = typeof RouteNames[keyof typeof RouteNames];
