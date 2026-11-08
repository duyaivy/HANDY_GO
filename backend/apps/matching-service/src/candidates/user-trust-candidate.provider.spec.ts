import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserTrustCandidateProvider } from './user-trust-candidate.provider.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Matching to User Trust production routing', () => {
  it('uses the VPS1 WireGuard address instead of Docker-local DNS', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('USER_TRUST_SERVICE_URL', 'http://10.77.0.1:3002');
    vi.stubEnv('INTERNAL_SERVICE_SECRET', 'test-secret');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await new UserTrustCandidateProvider().findCandidates({ serviceId: 'svc', latitude: 1, longitude: 2 });
    expect(fetch.mock.calls[0][0]).toBe('http://10.77.0.1:3002/api/v1/internal/v1/workers/candidates?serviceId=svc&latitude=1&longitude=2');
  });

  it.each(['http://user-trust-service:3002', 'http://localhost:3002', 'http://10.77.0.2:3002'])
    ('rejects invalid cross-host endpoint %s in production', async (endpoint) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('USER_TRUST_SERVICE_URL', endpoint);
      const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
      await expect(new UserTrustCandidateProvider().findCandidates({ serviceId: 'svc', latitude: 1, longitude: 2 }))
        .rejects.toThrow('User Trust unavailable');
      expect(fetch).not.toHaveBeenCalled();
    });

  it('does not fall back to localhost when the production URL is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('USER_TRUST_SERVICE_URL', '');
    await expect(new UserTrustCandidateProvider().findCandidates({ serviceId: 'svc', latitude: 1, longitude: 2 }))
      .rejects.toThrow('User Trust unavailable');
  });
});
