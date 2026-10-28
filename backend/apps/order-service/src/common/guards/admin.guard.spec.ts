import { describe, expect, it } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';

function createMockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard (BE-02)', () => {
  const guard = new AdminGuard();

  it('allows request when x-user-roles contains Admin (case-insensitive)', () => {
    const ctx = createMockContext({ 'x-user-roles': 'Admin' });
    expect(guard.canActivate(ctx)).toBe(true);

    const ctxMulti = createMockContext({ 'x-user-roles': 'Customer,admin' });
    expect(guard.canActivate(ctxMulti)).toBe(true);
  });

  it('throws 403 ForbiddenException when x-user-roles is missing', () => {
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws 403 ForbiddenException when user is Customer only', () => {
    const ctx = createMockContext({ 'x-user-roles': 'Customer' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws 403 ForbiddenException when user is Worker only', () => {
    const ctx = createMockContext({ 'x-user-roles': 'Worker' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
