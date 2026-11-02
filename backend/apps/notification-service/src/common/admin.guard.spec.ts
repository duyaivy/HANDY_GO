import { describe, expect, it } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';

function createMockContext(headers: Record<string, string | undefined>): ExecutionContext {
  const req = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('allows request when x-user-roles includes Admin', () => {
    const ctx = createMockContext({ 'x-user-roles': 'Admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows request when x-user-roles has multiple roles including Admin (case insensitive)', () => {
    const ctx = createMockContext({ 'x-user-roles': 'Customer,admin,Worker' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when x-user-roles header is missing', () => {
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when x-user-roles does not contain Admin', () => {
    const ctx = createMockContext({ 'x-user-roles': 'Customer,Worker' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
