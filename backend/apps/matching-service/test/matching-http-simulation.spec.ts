import { describe, it, expect, afterEach, vi } from 'vitest';
import { UserTrustCandidateProvider } from '../src/candidates/user-trust-candidate.provider.js';
import { FastApiAiRankingProvider } from '../src/ranking/fastapi-ai-ranking.provider.js';
import { BiddingClient } from '../../api-gateway/src/candidates/clients/bidding.client.js';

const base = process.env.PR34_SIMULATION_URL;
describe.skipIf(!base)(
  'PR34 real HTTP transport against Postman simulation',
  () => {
    afterEach(() => vi.unstubAllEnvs());
    const params = {
      serviceId: '00000000-0000-4000-8000-000000000001',
      latitude: 10.77,
      longitude: 106.7,
    };
    it('accepts an authoritative empty array', async () => {
      vi.stubEnv('USER_TRUST_SERVICE_URL', `${base}/healthy`);
      expect(
        await new UserTrustCandidateProvider().findCandidates(params),
      ).toEqual([]);
    });
    it('throws when User Trust returns 503 instead of returning zero workers', async () => {
      vi.stubEnv('USER_TRUST_SERVICE_URL', `${base}/unavailable`);
      await expect(
        new UserTrustCandidateProvider().findCandidates(params),
      ).rejects.toThrow('candidate query failed');
    });
    it('aborts delayed candidate discovery with the job signal', async () => {
      vi.stubEnv('USER_TRUST_SERVICE_URL', `${base}/delayed`);
      const start = Date.now();
      await expect(
        new UserTrustCandidateProvider().findCandidates(
          params,
          AbortSignal.timeout(100),
        ),
      ).rejects.toThrow();
      expect(Date.now() - start).toBeLessThan(1000);
    });
    it('aborts hanging AI inference without starting another attempt after parent abort', async () => {
      vi.stubEnv('AI_SERVICE_URL', `${base}/healthy`);
      const start = Date.now();
      await expect(
        new FastApiAiRankingProvider().rank(
          {
            serviceRequestId: params.serviceId,
            requestRevision: 1,
            serviceId: params.serviceId,
            requestDescription: 'repair',
            requestLatitude: 10.77,
            requestLongitude: 106.7,
            candidates: [],
            topN: 20,
          },
          AbortSignal.timeout(100),
        ),
      ).rejects.toThrow();
      expect(Date.now() - start).toBeLessThan(1000);
    });
    it('surfaces status-only upstream failure as partial even when bids succeed', async () => {
      const client = new BiddingClient({
        getUrl: () => `${base}/healthy`,
        upstreamTimeoutMs: 1000,
        internalServiceSecret: 'simulation-only',
      } as any);
      const result = await client.getBidsAndStatus(
        params.serviceId,
        { page: 1, limit: 10 },
        { userId: params.serviceId, roles: ['Customer'] },
      );
      expect(result.status).toBe('unavailable');
      expect(result.error).toContain('503');
      expect(result.items).toEqual([]);
    });
  },
);
