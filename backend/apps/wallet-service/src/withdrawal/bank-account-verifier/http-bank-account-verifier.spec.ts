import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpBankAccountVerifier } from './http-bank-account-verifier.js';

const config = (base?: string, prefix = 'api/v1') =>
  ({
    getUrl: () => {
      if (!base) throw new Error('missing');
      return base;
    },
    apiPrefix: prefix,
    upstreamTimeoutMs: 1000,
    internalServiceSecret: 's',
  }) as never;

const respond = (ok: boolean, body: unknown, status = ok ? 200 : 500) =>
  vi.fn().mockResolvedValue({ ok, status, json: async () => body });

describe('HttpBankAccountVerifier', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds the URL from USER_TRUST_SERVICE_URL and API prefix', async () => {
    const fetchMock = respond(true, { owned: true, active: true });
    vi.stubGlobal('fetch', fetchMock);
    await new HttpBankAccountVerifier(config('http://trust:3002/')).verify('u', 'b');
    expect(fetchMock.mock.calls[0]![0]).toBe('http://trust:3002/api/v1/internal/users/verify-bank-account');
    expect(new HttpBankAccountVerifier(config('http://trust:3002', '')).buildUrl()).toBe(
      'http://trust:3002/internal/users/verify-bank-account',
    );
  });

  it('accepts only owned && active', async () => {
    vi.stubGlobal('fetch', respond(true, { owned: true, active: true }));
    await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).resolves.toBe(true);
  });

  it.each([[{ owned: true, active: false }], [{ owned: false, active: false }], [{ owned: false, active: true }]])(
    'rejects definite denial %j with false',
    async (body) => {
      vi.stubGlobal('fetch', respond(true, body));
      await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).resolves.toBe(false);
    },
  );

  it.each([
    ['HTTP 500', () => respond(false, {})],
    ['HTTP 403 (wrong secret)', () => respond(false, {}, 403)],
    ['invalid body', () => respond(true, {})],
    ['network error', () => vi.fn().mockRejectedValue(new Error('down'))],
  ])('throws 503 (not a denial) on %s', async (_name, make) => {
    vi.stubGlobal('fetch', make());
    await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).rejects.toMatchObject({ status: 503 });
  });

  it('throws 503 when USER_TRUST_SERVICE_URL is missing', async () => {
    await expect(new HttpBankAccountVerifier(config()).verify('u', 'b')).rejects.toMatchObject({ status: 503 });
  });
});
