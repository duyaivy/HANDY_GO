import { sanitize, SENSITIVE_KEYS } from '../logger';

describe('logger sanitizer', () => {
  it('should include otp in SENSITIVE_KEYS', () => {
    expect(SENSITIVE_KEYS).toContain('otp');
  });

  it('should sanitize otp, password, and tokens in object payload', () => {
    const payload = {
      phone: '0912345678',
      otp: '123456',
      password: 'MySecretPassword',
      accessToken: 'jwt.token.here',
      refreshToken: 'refresh.token.here',
      publicInfo: 'visible',
    };

    const sanitized = sanitize(payload) as Record<string, unknown>;

    expect(sanitized.otp).toBe('***[REDACTED]***');
    expect(sanitized.password).toBe('***[REDACTED]***');
    expect(sanitized.accessToken).toBe('***[REDACTED]***');
    expect(sanitized.refreshToken).toBe('***[REDACTED]***');
    expect(sanitized.phone).toBe('0912345678');
    expect(sanitized.publicInfo).toBe('visible');
  });

  it('should sanitize nested objects and arrays containing otp', () => {
    const complexData = {
      user: {
        credentials: {
          otpCode: '654321',
        },
      },
      list: [{ otp: '999888' }, { name: 'Item 1' }],
    };

    const sanitized = sanitize(complexData) as any;
    expect(sanitized.user.credentials.otpCode).toBe('***[REDACTED]***');
    expect(sanitized.list[0].otp).toBe('***[REDACTED]***');
    expect(sanitized.list[1].name).toBe('Item 1');
  });
});
