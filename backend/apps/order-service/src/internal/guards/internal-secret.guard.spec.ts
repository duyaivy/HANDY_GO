import { describe, expect, it, beforeEach } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalSecretGuard } from './internal-secret.guard.js';
import type { ConfigService } from '@app/config';

describe('InternalSecretGuard', () => {
  let guard: InternalSecretGuard;
  let configServiceMock: {
    internalServiceSecret: string;
  };

  const secret = 'super-secret-internal-key-12345';

  beforeEach(() => {
    configServiceMock = {
      internalServiceSecret: secret,
    };

    guard = new InternalSecretGuard(
      configServiceMock as unknown as ConfigService,
    );
  });

  const createMockContext = (headers: Record<string, string>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access when x-internal-secret matches configured secret', () => {
    const context = createMockContext({
      'x-internal-secret': secret,
    });

    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when x-internal-secret is missing', () => {
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when x-internal-secret does not match', () => {
    const context = createMockContext({
      'x-internal-secret': 'wrong-secret',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
