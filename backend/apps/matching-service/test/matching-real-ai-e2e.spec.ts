import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastApiAiRankingProvider } from '../src/ranking/fastapi-ai-ranking.provider.js';
import { MockAiRankingProvider } from '../src/ranking/mock-ai-ranking.provider.js';
import { RuleBasedFallbackRanker } from '../src/ranking/rule-based-fallback.ranker.js';
import { RankingValidatorService } from '../src/ranking/ranking-validator.service.js';
import { FeatureBuilderService } from '../src/features/feature-builder.service.js';
import type { RankingRequestDto } from '../src/ranking/ranking.dto.js';

const isFastApiRunning = await (async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/health', {
      signal: AbortSignal.timeout(500),
    });
    return res.ok;
  } catch {
    return false;
  }
})();

describe('Real AI FastApi Integration (Live E2E)', () => {
  let fastApiProvider: FastApiAiRankingProvider;
  let mockProvider: MockAiRankingProvider;
  let fallbackRanker: RuleBasedFallbackRanker;
  let validator: RankingValidatorService;
  let featureBuilder: FeatureBuilderService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:8000';
    process.env.AI_SERVICE_TIMEOUT_MS = '10000';
    process.env.INTERNAL_SERVICE_SECRET = 'handy-go-internal-service-secret-key-12345';

    fastApiProvider = new FastApiAiRankingProvider();
    featureBuilder = new FeatureBuilderService();
    mockProvider = new MockAiRankingProvider(featureBuilder);
    fallbackRanker = new RuleBasedFallbackRanker(featureBuilder);
    validator = new RankingValidatorService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.runIf(isFastApiRunning)(
    'Scenario A: Live Real AI Ranking - should execute live model inference and validate invariants',
    async () => {
    const candidates = [
      {
        workerUserId: '11111111-1111-1111-1111-111111111111',
        offeringTitle: 'Chuyên gia điện lạnh',
        offeringDescription: 'Chuyên sửa máy lạnh chảy nước, không lạnh, nạp gas R32',
        distanceKm: 1.5,
        radiusKm: 10.0,
        averageRating: 4.9,
        ratingCount: 38,
        experienceYears: 7,
        historicalCompletionRate: 0.98,
      },
      {
        workerUserId: '22222222-2222-2222-2222-222222222222',
        offeringTitle: 'Thợ điện dân dụng',
        offeringDescription: 'Sửa đường dây điện gia đình, thay aptomat chập cháy',
        distanceKm: 2.0,
        radiusKm: 10.0,
        averageRating: 4.6,
        ratingCount: 15,
        experienceYears: 4,
        historicalCompletionRate: 0.90,
      },
    ];

    const request: RankingRequestDto = {
      serviceRequestId: 'req-real-ai-001',
      requestRevision: 1,
      serviceId: 'srv-ac',
      requestDescription: 'Máy lạnh nhà tôi bị chảy nước nhỏ giọt xuống sàn phòng ngủ',
      requestLatitude: 10.772,
      requestLongitude: 106.698,
      candidates,
      topN: 20,
    };

    const response = await fastApiProvider.rank(request);

    // Validate top-level contract
    expect(response.providerType).toBe('real_ai');
    expect(response.modelVersion).toContain('multilingual-e5-small');
    expect(response.rankedWorkers).toHaveLength(2);

    // Validate using RankingValidatorService
    const eligibleIds = new Set(candidates.map((c) => c.workerUserId));
    expect(() => validator.validateRankingOutput(response, eligibleIds, 20)).not.toThrow();

    // AC expert must rank #1 over general electrician
    expect(response.rankedWorkers[0].workerUserId).toBe('11111111-1111-1111-1111-111111111111');
    expect(response.rankedWorkers[0].rank).toBe(1);
    expect(response.rankedWorkers[0].matchingScore).toBeGreaterThan(response.rankedWorkers[1].matchingScore);

    // Score breakdowns must be valid and within [0, 100]
    for (const worker of response.rankedWorkers) {
      expect(worker.matchingScore).toBeGreaterThanOrEqual(0.0);
      expect(worker.matchingScore).toBeLessThanOrEqual(100.0);
      expect(worker.scoreBreakdown.semanticScore).toBeGreaterThan(0.0);
    }
  });

  it.runIf(isFastApiRunning)(
    'Scenario B: Invalid Internal Secret - should reject and gracefully fallback',
    async () => {
      process.env.INTERNAL_SERVICE_SECRET = 'completely-wrong-unauthorized-secret';
      const unauthorizedProvider = new FastApiAiRankingProvider();

      const candidates = [
        {
          workerUserId: 'worker-fallback-01',
          offeringTitle: 'Thợ sửa điện',
          offeringDescription: 'Sửa chữa điện',
          distanceKm: 1.0,
          radiusKm: 10.0,
          averageRating: 4.8,
          ratingCount: 20,
          experienceYears: 5,
          historicalCompletionRate: 0.95,
        },
      ];

      const request: RankingRequestDto = {
        serviceRequestId: 'req-auth-fail',
        requestRevision: 1,
        serviceId: 'srv-ac',
        requestDescription: 'Sửa máy lạnh',
        requestLatitude: 10.772,
        requestLongitude: 106.698,
        candidates,
        topN: 20,
      };

      // Primary call fails with 403 Forbidden
      let fallbackActivated = false;
      let fallbackResponse;

      try {
        await unauthorizedProvider.rank(request);
      } catch {
        fallbackActivated = true;
        // Execute established fallback
        fallbackResponse = await fallbackRanker.rank(request);
      }

      expect(fallbackActivated).toBe(true);
      expect(fallbackResponse).toBeDefined();
      expect(fallbackResponse?.providerType).toBe('fallback');
      expect(fallbackResponse?.rankedWorkers[0].workerUserId).toBe('worker-fallback-01');
    },
  );

  it('Scenario C: Mock Provider Selection - mock provider continues working independently', async () => {
    const candidates = [
      {
        workerUserId: 'worker-mock-01',
        offeringTitle: 'Thợ điện lạnh',
        offeringDescription: 'Sửa chữa máy lạnh',
        distanceKm: 2.0,
        radiusKm: 10.0,
        averageRating: 4.8,
        ratingCount: 15,
        experienceYears: 4,
        historicalCompletionRate: 0.95,
      },
    ];

    const request: RankingRequestDto = {
      serviceRequestId: 'req-mock-001',
      requestRevision: 1,
      serviceId: 'srv-ac',
      requestDescription: 'Sửa máy lạnh',
      requestLatitude: 10.772,
      requestLongitude: 106.698,
      candidates,
      topN: 20,
    };

    const mockResp = await mockProvider.rank(request);
    expect(mockResp.providerType).toBe('mock');
    expect(mockResp.rankedWorkers).toHaveLength(1);
    expect(mockResp.rankedWorkers[0].workerUserId).toBe('worker-mock-01');
  });

  it.runIf(isFastApiRunning)(
    'Scenario E: Missing Historical Data - should renormalize weights correctly',
    async () => {
      const candidates = [
        {
          workerUserId: 'worker-no-history',
          offeringTitle: 'Thợ điện lạnh',
          offeringDescription: 'Sửa chữa máy lạnh, vệ sinh điều hòa',
          distanceKm: 1.5,
          radiusKm: 10.0,
          averageRating: 4.8,
          ratingCount: 20,
          experienceYears: 5,
          historicalCompletionRate: undefined, // Globally unavailable
        },
      ];

      const request: RankingRequestDto = {
        serviceRequestId: 'req-no-history',
        requestRevision: 1,
        serviceId: 'srv-ac',
        requestDescription: 'Máy lạnh không lạnh',
        requestLatitude: 10.772,
        requestLongitude: 106.698,
        candidates,
        topN: 20,
      };

      const response = await fastApiProvider.rank(request);
      expect(response.providerType).toBe('real_ai');
      expect(response.rankedWorkers[0].metadata?.renormalizedWeights).toBe(true);
      expect(response.rankedWorkers[0].scoreBreakdown.completionScore).toBe(0.0);
    },
  );
});
