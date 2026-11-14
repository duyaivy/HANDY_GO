import { ForbiddenException } from '@nestjs/common';
import { Role, StandardPermissions, type AuthenticatedUser } from '@app/auth';
import { isUUID } from 'class-validator';

// Colon-style names follow the existing project convention (e.g. `wallet:adjust`).
// Auth Service must grant them to the Admin roles that may use these Payment APIs.
export const PAYMENT_PERMISSIONS = {
  readAll: StandardPermissions.PAYMENT_READ_ALL,
  commissionManage: StandardPermissions.COMMISSION_MANAGE,
  refundReadAll: StandardPermissions.REFUND_READ_ALL,
  refundCreate: StandardPermissions.REFUND_CREATE,
  refundApprove: StandardPermissions.REFUND_APPROVE,
  refundConfirm: StandardPermissions.REFUND_CONFIRM,
  reconcile: StandardPermissions.PAYMENT_RECONCILE,
  dlqReplay: StandardPermissions.PAYMENT_DLQ_REPLAY,
} as const;

export type PaymentPermission =
  (typeof PAYMENT_PERMISSIONS)[keyof typeof PAYMENT_PERMISSIONS];

export function hasAdminPermission(
  user: AuthenticatedUser | undefined,
  permission: PaymentPermission,
): boolean {
  if (!user || !isUUID(user.userId)) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return (
    roles.some(
      (role) =>
        typeof role === 'string' &&
        role.toLowerCase() === Role.ADMIN.toLowerCase(),
    ) && permissions.includes(permission)
  );
}

/** Returns the Admin's user id (the audit actor); never trusts anything beyond the verified JWT. */
export function requireAdminPermission(
  user: AuthenticatedUser | undefined,
  permission: PaymentPermission,
): string {
  if (!user || !hasAdminPermission(user, permission)) {
    throw new ForbiddenException(`Admin permission ${permission} is required`);
  }
  return user.userId;
}
