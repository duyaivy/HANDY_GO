import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockTopupProvider } from './mock-topup.provider.js';

afterEach(() => vi.unstubAllEnvs());
describe('MockTopupProvider', () => {
  it('requires explicit enablement and refuses production, including direct confirmations', () => {
    vi.stubEnv('TOPUP_MOCK_ENABLED', 'false');
    const provider = new MockTopupProvider();
    expect(provider.isConfigured()).toBe(false);
    vi.stubEnv('TOPUP_MOCK_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    expect(provider.isConfigured()).toBe(false);
    expect(() => provider.confirmation('reference', 100n, true)).toThrow(
      /disabled/,
    );
  });
  it('marks simulation clearly and never accepts a public provider callback', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TOPUP_MOCK_ENABLED', 'true');
    const provider = new MockTopupProvider();
    expect(provider.name).toBe('mock');
    expect(provider.verifyNotification().signatureValid).toBe(false);
    expect(provider.confirmation('reference', 100n, true)).toMatchObject({
      providerTransactionNo: 'MOCK-reference',
      success: true,
      auditPayload: { isSimulated: 'true' },
    });
  });
});
