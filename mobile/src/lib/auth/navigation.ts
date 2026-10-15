import { RouteNames } from '@/constants/route-names';

export type RoleDestination
  = | { type: 'ROUTE'; path: string }
    | { type: 'ADMIN_UNSUPPORTED' }
    | { type: 'UNAUTHENTICATED' };

/**
 * Determines target screen according to user roles and optional activeMode:
 * - If activeMode is 'Worker' and user has 'Worker': Worker Home
 * - If activeMode is 'Customer' and user has 'Customer': Customer Home
 * - Fallback:
 *   - Has Customer (or Customer + Worker default): Customer Home
 *   - Worker-only: Worker Home
 *   - Admin-only: Mobile unsupported
 */
export function getDestination(
  roles?: string[],
  activeMode?: 'Customer' | 'Worker' | null,
): RoleDestination {
  if (!roles || roles.length === 0) {
    return { type: 'UNAUTHENTICATED' };
  }

  if (activeMode === 'Worker' && roles.includes('Worker')) {
    return { type: 'ROUTE', path: RouteNames.WORKER_HOME };
  }

  if (activeMode === 'Customer' && roles.includes('Customer')) {
    return { type: 'ROUTE', path: RouteNames.CUSTOMER_HOME };
  }

  if (roles.includes('Customer')) {
    return { type: 'ROUTE', path: RouteNames.CUSTOMER_HOME };
  }

  if (roles.includes('Worker')) {
    return { type: 'ROUTE', path: RouteNames.WORKER_HOME };
  }

  if (roles.includes('Admin')) {
    return { type: 'ADMIN_UNSUPPORTED' };
  }

  return { type: 'UNAUTHENTICATED' };
}

export function getDestinationByRoles(
  roles?: string[],
  activeMode?: 'Customer' | 'Worker' | null,
): RoleDestination {
  return getDestination(roles, activeMode);
}
