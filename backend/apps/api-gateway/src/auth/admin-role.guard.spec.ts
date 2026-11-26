import { describe, expect, it } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminRoleGuard } from './admin-role.guard.js';

function createMockContext(headers: Record<string, string> = {}, user?: any): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        user,
      }),
    }),
  };
}

describe('AdminRoleGuard', () => {
  const guard = new AdminRoleGuard();

  it('throws UnauthorizedException when no user identity is present', () => {
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when user has Customer role', () => {
    const ctx = createMockContext({
      'x-user-id': 'user-123',
      'x-user-roles': 'Customer',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has Worker role', () => {
    const ctx = createMockContext({
      'x-user-id': 'worker-123',
      'x-user-roles': 'Worker',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows access when user has Admin role in header', () => {
    const ctx = createMockContext({
      'x-user-id': 'admin-123',
      'x-user-roles': 'Admin',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when user has Admin role in attached user object', () => {
    const ctx = createMockContext({}, { userId: 'admin-123', roles: ['admin'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when roles contain admin case-insensitively among multiple roles', () => {
    const ctx = createMockContext({
      'x-user-id': 'admin-123',
      'x-user-roles': 'Customer, ADMIN, Operator',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

