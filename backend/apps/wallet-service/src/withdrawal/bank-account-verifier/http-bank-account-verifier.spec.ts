import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpBankAccountVerifier } from './http-bank-account-verifier.js';

const config = (url?: string) =>
  ({
    getUrl: () => {
      if (!url) throw new Error('missing');
      return url;
    },
    upstreamTimeoutMs: 1000,
    internalServiceSecret: 's',
  }) as never;

const respond = (ok: boolean, body: unknown) =>
  vi.fn().mockResolvedValue({ ok, json: async () => body });

describe('HttpBankAccountVerifier (F08 fail-closed)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts only owned && active', async () => {
    vi.stubGlobal('fetch', respond(true, { owned: true, active: true }));
    await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).resolves.toBe(true);
  });

  it.each([
    [{ owned: true, active: false }],
    [{ owned: false, active: true }],
    [{}],
  ])('rejects %j', async (body) => {
    vi.stubGlobal('fetch', respond(true, body));
    await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).resolves.toBe(false);
  });

  it('rejects on HTTP error, network error and missing URL', async () => {
    vi.stubGlobal('fetch', respond(false, {}));
    await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await expect(new HttpBankAccountVerifier(config('http://x')).verify('u', 'b')).resolves.toBe(false);
    await expect(new HttpBankAccountVerifier(config()).verify('u', 'b')).resolves.toBe(false);
  });
});
