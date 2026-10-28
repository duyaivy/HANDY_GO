import { describe, expect, it } from 'vitest';
import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { TrustedGatewayGuard } from './trusted-gateway.guard.js';

function createMockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('TrustedGatewayGuard (BE-02)', () => {
  const secret = 'test-internal-secret-token-12345';
  const validUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const mockConfig: any = {
    internalServiceSecret: secret,
  };
  const guard = new TrustedGatewayGuard(mockConfig);

  it('allows request when valid internal secret and user ID are provided', () => {
    const ctx = createMockContext({
      'x-internal-secret': secret,
      'x-user-id': validUserId,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 ForbiddenException when internal secret is missing', () => {
    const ctx = createMockContext({
      'x-user-id': validUserId,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws 403 ForbiddenException when internal secret is wrong or spoofed', () => {
    const ctx = createMockContext({
      'x-internal-secret': 'wrong-internal-secret-value-xxxx',
      'x-user-id': validUserId,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('throws 401 UnauthorizedException when user ID is missing or invalid UUID', () => {
    const ctxMissing = createMockContext({
      'x-internal-secret': secret,
    });
    expect(() => guard.canActivate(ctxMissing)).toThrow(UnauthorizedException);

    const ctxInvalid = createMockContext({
      'x-internal-secret': secret,
      'x-user-id': 'not-a-uuid',
    });
    expect(() => guard.canActivate(ctxInvalid)).toThrow(UnauthorizedException);
  });
});
