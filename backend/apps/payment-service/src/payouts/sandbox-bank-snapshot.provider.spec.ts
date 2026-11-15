import { afterEach, describe, expect, it, vi } from 'vitest';
import { SandboxBankSnapshotProvider } from './sandbox-bank-snapshot.provider.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const config = {
  internalServiceSecret: 'test-secret',
  apiPrefix: 'api/v1',
  upstreamTimeoutMs: 1000,
  getUrl: () => 'http://127.0.0.1:3002',
};
describe('SandboxBankSnapshotProvider', () => {
  it('never calls User Trust in production or when mock is disabled', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PAYOUT_MOCK_ENABLED', 'true');
    const provider = new SandboxBankSnapshotProvider(config as never);
    expect(await provider.fetch('user', 'bank')).toBeNull();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYOUT_MOCK_ENABLED', 'false');
    expect(await provider.fetch('user', 'bank')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { owned: false, active: true },
    { owned: true, active: false },
    { owned: 'true', active: true },
    {},
  ])('rejects invalid ownership or active status %j', async (body) => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYOUT_MOCK_ENABLED', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
    );
    expect(
      await new SandboxBankSnapshotProvider(config as never).fetch(
        'user',
        'bank',
      ),
    ).toBeNull();
  });
  it('keeps only a simulated destination marker after ownership verification', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYOUT_MOCK_ENABLED', 'true');
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          owned: true,
          active: true,
          bankSecret: 'must-not-leak',
        }),
      });
    vi.stubGlobal('fetch', fetch);
    expect(
      await new SandboxBankSnapshotProvider(config as never).fetch(
        'user',
        'bank',
      ),
    ).toEqual({
      userId: 'user',
      bankAccountId: 'bank',
      provider: 'mock',
      isSimulated: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3002/api/v1/internal/users/verify-bank-account',
      expect.objectContaining({
        body: JSON.stringify({ userId: 'user', bankAccountId: 'bank' }),
      }),
    );
  });
});
