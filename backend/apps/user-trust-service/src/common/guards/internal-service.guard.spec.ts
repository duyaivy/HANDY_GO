import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { InternalServiceGuard } from './internal-service.guard.js';

describe('InternalServiceGuard in User & Trust Service', () => {
  const secret = 'test-secret-key-1234567890123456';
  const mockConfig: any = { internalServiceSecret: secret };
  const guard = new InternalServiceGuard(mockConfig);

  const createMockContext = (headers: Record<string, string>): any => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  });

  it('should allow request when x-internal-secret matches configured secret', () => {
    const context = createMockContext({ 'x-internal-secret': secret });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when x-internal-secret is missing', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(/authorization required/);
  });

  it('should throw ForbiddenException when x-internal-secret is incorrect', () => {
    const context = createMockContext({ 'x-internal-secret': 'wrong-secret' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
