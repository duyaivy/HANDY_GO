import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@app/config';
import { TrustedGatewayGuard } from './trusted-gateway.guard.js';

describe('TrustedGatewayGuard', () => {
  const userId = '873ee38a-3142-49fe-a191-d25b7de40d94';
  const guard = new TrustedGatewayGuard({
    internalServiceSecret: 'secret',
  } as ConfigService);
  const context = (headers: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as ExecutionContext;

  it.each([undefined, '', 'wrong', '秘密秘密秘密', ['secret']])(
    'rejects untrusted header %s without byte-length errors',
    (secret) => {
      expect(() =>
        guard.canActivate(
          context({ 'x-internal-secret': secret, 'x-user-id': userId }),
        ),
      ).toThrow('Request must originate');
    },
  );
  it.each([undefined, '', 'bad-id', [userId]])(
    'rejects invalid identity %s after authenticating the gateway',
    (id) => {
      expect(() =>
        guard.canActivate(
          context({ 'x-internal-secret': 'secret', 'x-user-id': id }),
        ),
      ).toThrow('authenticated user');
    },
  );
  it('accepts only a trusted gateway with valid identity', () => {
    expect(
      guard.canActivate(
        context({ 'x-internal-secret': 'secret', 'x-user-id': userId }),
      ),
    ).toBe(true);
  });
  it('fails closed when no internal secret is configured', () => {
    const missing = new TrustedGatewayGuard({
      internalServiceSecret: '',
    } as ConfigService);
    expect(() => missing.canActivate(context({ 'x-user-id': userId }))).toThrow(
      'Request must originate',
    );
  });
});
