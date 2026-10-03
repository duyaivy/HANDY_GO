import { RouteNames } from '@/constants/route-names';

export type RoleDestination
  = | { type: 'ROUTE'; path: string }
    | { type: 'ADMIN_UNSUPPORTED' }
    | { type: 'UNAUTHENTICATED' };

/**
 * Determines target screen according to user roles:
 * - Has Customer (or Customer + Worker): Customer Home
 * - Worker-only: Worker Home
 * - Admin-only: Mobile unsupported
 */
export function getDestinationByRoles(roles?: string[]): RoleDestination {
  if (!roles || roles.length === 0) {
    return { type: 'UNAUTHENTICATED' };
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
