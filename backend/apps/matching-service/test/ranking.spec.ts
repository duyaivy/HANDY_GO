import { describe, expect, it } from 'vitest';
import { MockAiRankingProvider } from '../src/ranking/mock-ai-ranking.provider.js';
import { RuleBasedFallbackRanker } from '../src/ranking/rule-based-fallback.ranker.js';
import { RankingValidatorService } from '../src/ranking/ranking-validator.service.js';
import { FeatureBuilderService } from '../src/features/feature-builder.service.js';
import type {
  RankingCandidateInput,
  RankingRequestDto,
} from '../src/ranking/ranking.dto.js';

describe('MockAiRankingProvider & Ranking Validation', () => {
  const featureBuilder = new FeatureBuilderService();
  const mockRanker = new MockAiRankingProvider(featureBuilder);
  const fallbackRanker = new RuleBasedFallbackRanker(featureBuilder);
  const validator = new RankingValidatorService();

  const createMockCandidate = (
    id: string,
    distanceKm: number,
    rating = 4.8,
  ): RankingCandidateInput => ({
    workerUserId: id,
    offeringTitle: `Thợ sửa điện gia dụng ${id}`,
    offeringDescription: 'Chuyên sửa chữa điện chập, lắp đặt đèn quạt ổ cắm',
    distanceKm,
    radiusKm: 15.0,
    averageRating: rating,
    ratingCount: 20,
    experienceYears: 6,
  });

  const baseRequest: RankingRequestDto = {
    serviceRequestId: 'req-abc-123',
    requestRevision: 1,
    serviceId: 'srv-elec',
    requestDescription: 'Cần sửa chữa ổ cắm điện bị chập cháy trong phòng khách',
    requestLatitude: 10.772,
    requestLongitude: 106.6983,
    candidates: [
      createMockCandidate('worker-A', 1.2, 4.9),
      createMockCandidate('worker-B', 8.5, 4.2),
      createMockCandidate('worker-C', 3.0, 4.7),
    ],
    topN: 20,
  };

  it('Deterministic Ranking: should return identical scores and order for identical inputs', async () => {
    const run1 = await mockRanker.rank(baseRequest);
    const run2 = await mockRanker.rank(baseRequest);

    expect(run1.rankedWorkers).toHaveLength(3);
    expect(run1.rankedWorkers).toEqual(run2.rankedWorkers);

    // Closest and highest-rated (worker-A) should be rank 1
    expect(run1.rankedWorkers[0].workerUserId).toBe('worker-A');
    expect(run1.rankedWorkers[0].rank).toBe(1);
    expect(run1.rankedWorkers[0].matchingScore).toBeGreaterThan(
      run1.rankedWorkers[1].matchingScore,
    );
  });

  it('Metadata: should identify itself as mock provider and flag synthetic score', async () => {
    const result = await mockRanker.rank(baseRequest);
    expect(result.providerType).toBe('mock');
    expect(result.modelVersion).toBe('mock-ai-v1.0');
    expect(result.rankedWorkers[0].metadata?.isSyntheticSemanticScore).toBe(true);
  });

  it('Persistence Bounds: should restrict ranked workers to topN (max 20)', async () => {
    const manyCandidates: RankingCandidateInput[] = [];
    for (let i = 1; i <= 30; i++) {
      manyCandidates.push(createMockCandidate(`worker-${i}`, i * 0.5));
    }

    const result = await mockRanker.rank({
      ...baseRequest,
      candidates: manyCandidates,
      topN: 20,
    });

    expect(result.rankedWorkers).toHaveLength(20);
    expect(result.rankedWorkers[19].rank).toBe(20);
  });

  it('Simulation: should support simulated error', async () => {
    await expect(
      mockRanker.rank({
        ...baseRequest,
        simulationOptions: { simulateError: true },
      }),
    ).rejects.toThrow('Simulated Mock AI Ranking Failure');
  });

  it('Simulation: should support simulated empty result', async () => {
    const result = await mockRanker.rank({
      ...baseRequest,
      simulationOptions: { simulateEmpty: true },
    });
    expect(result.rankedWorkers).toHaveLength(0);
  });

  it('Fallback Ranker: should execute rule-based scoring with fallback providerType', async () => {
    const fallbackResult = await fallbackRanker.rank(baseRequest);
    expect(fallbackResult.providerType).toBe('fallback');
    expect(fallbackResult.modelVersion).toBe('rule-based-fallback-v1.0');
    expect(fallbackResult.rankedWorkers).toHaveLength(3);
    expect(fallbackResult.rankedWorkers[0].rank).toBe(1);
  });

  describe('RankingValidatorService', () => {
    it('should pass valid ranking response', async () => {
      const result = await mockRanker.rank(baseRequest);
      const eligibleIds = new Set(['worker-A', 'worker-B', 'worker-C']);

      expect(() =>
        validator.validateRankingOutput(result, eligibleIds, 20),
      ).not.toThrow();
    });

    it('should reject worker not belonging to eligible candidate set', async () => {
      const result = await mockRanker.rank(baseRequest);
      const restrictedSet = new Set(['worker-A']); // worker-B and worker-C missing

      expect(() =>
        validator.validateRankingOutput(result, restrictedSet, 20),
      ).toThrow(/not in the eligible candidate pool/);
    });

    it('should reject duplicate worker in ranking results', () => {
      const eligibleIds = new Set(['worker-A', 'worker-B']);
      const invalidResponse: any = {
        modelVersion: 'mock-ai-v1.0',
        providerType: 'mock',
        rankedWorkers: [
          {
            workerUserId: 'worker-A',
            rank: 1,
            matchingScore: 90,
            scoreBreakdown: { semanticScore: 90, geoScore: 90, ratingScore: 90, experienceScore: 90, completionScore: 90 },
          },
          {
            workerUserId: 'worker-A', // duplicate!
            rank: 2,
            matchingScore: 85,
            scoreBreakdown: { semanticScore: 85, geoScore: 85, ratingScore: 85, experienceScore: 85, completionScore: 85 },
          },
        ],
      };

      expect(() =>
        validator.validateRankingOutput(invalidResponse, eligibleIds, 20),
      ).toThrow(/Duplicate worker/);
    });

    it('should reject non-finite or out-of-bounds scores', () => {
      const eligibleIds = new Set(['worker-A']);
      const invalidResponse: any = {
        modelVersion: 'mock-ai-v1.0',
        providerType: 'mock',
        rankedWorkers: [
          {
            workerUserId: 'worker-A',
            rank: 1,
            matchingScore: 105.0, // > 100!
            scoreBreakdown: { semanticScore: 90, geoScore: 90, ratingScore: 90, experienceScore: 90, completionScore: 90 },
          },
        ],
      };

      expect(() =>
        validator.validateRankingOutput(invalidResponse, eligibleIds, 20),
      ).toThrow(/invalid matchingScore/);
    });

    it('should reject discontinuous rank order', () => {
      const eligibleIds = new Set(['worker-A', 'worker-B']);
      const invalidResponse: any = {
        modelVersion: 'mock-ai-v1.0',
        providerType: 'mock',
        rankedWorkers: [
          {
            workerUserId: 'worker-A',
            rank: 1,
            matchingScore: 90,
          },
          {
            workerUserId: 'worker-B',
            rank: 5, // Gap in ranks (expected 2)!
            matchingScore: 80,
          },
        ],
      };

      expect(() =>
        validator.validateRankingOutput(invalidResponse, eligibleIds, 20),
      ).toThrow(/Invalid rank sequence/);
    });
  });
});
