import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@app/auth';
import {
  hasAdminPermission,
  PAYMENT_PERMISSIONS,
  requireAdminPermission,
} from './admin-access.js';

describe('Payment Admin authorization', () => {
  const user: AuthenticatedUser = {
    userId: randomUUID(),
    accountId: randomUUID(),
    sessionId: randomUUID(),
    roles: ['Admin'],
    permissions: [PAYMENT_PERMISSIONS.refundApprove],
  };
  it('requires both a verified Admin role and the exact permission', () => {
    expect(
      requireAdminPermission(user, PAYMENT_PERMISSIONS.refundApprove),
    ).toBe(user.userId);
    expect(
      hasAdminPermission(
        { ...user, roles: ['Customer'] },
        PAYMENT_PERMISSIONS.refundApprove,
      ),
    ).toBe(false);
    expect(
      hasAdminPermission(
        { ...user, permissions: [] },
        PAYMENT_PERMISSIONS.refundApprove,
      ),
    ).toBe(false);
    expect(
      hasAdminPermission(
        { ...user, permissions: ['refund.approve'] },
        PAYMENT_PERMISSIONS.refundApprove,
      ),
    ).toBe(false);
  });
  it('rejects missing identities and malformed audit actors', () => {
    expect(() =>
      requireAdminPermission(undefined, PAYMENT_PERMISSIONS.refundApprove),
    ).toThrow();
    expect(() =>
      requireAdminPermission(
        { ...user, userId: 'fake-admin' },
        PAYMENT_PERMISSIONS.refundApprove,
      ),
    ).toThrow();
  });
});
