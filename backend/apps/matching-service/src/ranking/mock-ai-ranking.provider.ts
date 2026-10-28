import { Injectable, Logger } from '@nestjs/common';
import type { IRankingProvider } from './ranking-provider.interface.js';
import type {
  RankingCandidateInput,
  RankingRequestDto,
  RankingResponseDto,
  RankedWorkerOutput,
} from './ranking.dto.js';
import { FeatureBuilderService } from '../features/feature-builder.service.js';

@Injectable()
export class MockAiRankingProvider implements IRankingProvider {
  private readonly logger = new Logger(MockAiRankingProvider.name);

  readonly providerType = 'mock' as const;
  readonly modelVersion = 'mock-ai-v1.0';

  constructor(private readonly featureBuilder: FeatureBuilderService) {}

  /**
   * Deterministic simulated semantic similarity score between request description
   * and worker offering title/description.
   * Uses token overlap (Jaccard similarity) and length weighting to produce
   * a stable, repeatable score in [0.0, 100.0] without external ML models.
   */
  private calculateDeterministicSemanticScore(
    requestText: string,
    offeringText: string,
  ): number {
    const cleanReq = requestText.toLowerCase().trim();
    const cleanOff = offeringText.toLowerCase().trim();

    if (!cleanReq || !cleanOff) {
      return 50.0; // neutral synthetic baseline for missing descriptions
    }

    const reqTokens = new Set(
      cleanReq.split(/\s+/).filter((t) => t.length > 1),
    );
    const offTokens = new Set(
      cleanOff.split(/\s+/).filter((t) => t.length > 1),
    );

    if (reqTokens.size === 0 || offTokens.size === 0) {
      return 50.0;
    }

    let intersectionCount = 0;
    for (const token of reqTokens) {
      if (offTokens.has(token)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...reqTokens, ...offTokens]).size;
    const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0.0;

    // Scale Jaccard from [0.0, 1.0] to a realistic semantic score range [40.0, 98.0]
    const semanticScore = 40.0 + jaccard * 58.0;
    return (
      Math.round(Math.max(0.0, Math.min(100.0, semanticScore)) * 100) / 100
    );
  }

  async rank(
    request: RankingRequestDto,
    signal?: AbortSignal,
  ): Promise<RankingResponseDto> {
    if (signal?.aborted) {
      throw new Error(`Mock AI Ranking aborted: ${signal.reason || 'aborted'}`);
    }
    const {
      candidates,
      requestDescription,
      simulationOptions,
      topN = 20,
    } = request;

    // 1. Simulation Controls (for automated resilience and failure tests)
    if (simulationOptions?.simulateTimeoutMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, simulationOptions.simulateTimeoutMs),
      );
    }

    if (simulationOptions?.simulateError) {
      this.logger.warn(
        `Simulation error triggered for request ${request.serviceRequestId}`,
      );
      throw new Error('Simulated Mock AI Ranking Failure');
    }

    if (simulationOptions?.simulateEmpty || candidates.length === 0) {
      return {
        modelVersion: this.modelVersion,
        providerType: this.providerType,
        rankedWorkers: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // 2. Resolve active feature weights and detect platform cold-start
    const hasAnyCompletion = candidates.some(
      (c) => c.historicalCompletionRate !== undefined,
    );
    const weightResolution = this.featureBuilder.resolveActiveWeights(
      candidates,
      hasAnyCompletion,
    );
    const weights = weightResolution.weights;

    // 3. Score every candidate deterministically across the 5 feature dimensions
    const scoredCandidates: Array<{
      candidate: RankingCandidateInput;
      matchingScore: number;
      semanticScore: number;
      geoScore: number;
      ratingScore: number;
      experienceScore: number;
      completionScore: number;
    }> = [];

    for (const candidate of candidates) {
      const normalizedFeatures = this.featureBuilder.buildCandidateFeatures(
        candidate,
        hasAnyCompletion,
      );

      const semanticScore = this.calculateDeterministicSemanticScore(
        requestDescription,
        normalizedFeatures.cleanedOfferingText,
      );

      const geoScore = normalizedFeatures.geoScore;
      const ratingScore = normalizedFeatures.ratingScore;
      const experienceScore = normalizedFeatures.experienceScore;
      const completionScore = normalizedFeatures.completionScore ?? 0.0;

      // Composite Weighted Score: S = sum(w_i * s_i)
      const matchingScoreRaw =
        weights.semantic * semanticScore +
        weights.geo * geoScore +
        weights.rating * ratingScore +
        weights.experience * experienceScore +
        weights.completion * completionScore;

      const matchingScore =
        Math.round(Math.max(0.0, Math.min(100.0, matchingScoreRaw)) * 100) /
        100;

      scoredCandidates.push({
        candidate,
        matchingScore,
        semanticScore,
        geoScore,
        ratingScore,
        experienceScore,
        completionScore,
      });
    }

    // 4. Stable deterministic sort:
    // Primary: matchingScore DESC
    // Secondary tie-breaker: distanceKm ASC
    // Tertiary tie-breaker: workerUserId ASC
    scoredCandidates.sort((a, b) => {
      if (b.matchingScore !== a.matchingScore) {
        return b.matchingScore - a.matchingScore;
      }
      if (a.candidate.distanceKm !== b.candidate.distanceKm) {
        return a.candidate.distanceKm - b.candidate.distanceKm;
      }
      return a.candidate.workerUserId.localeCompare(b.candidate.workerUserId);
    });

    // 5. Restrict to configured Top N (max 20) and assign sequential ranks 1..N
    const limitedCandidates = scoredCandidates.slice(0, Math.min(20, topN));

    const rankedWorkers: RankedWorkerOutput[] = limitedCandidates.map(
      (item, index) => ({
        workerUserId: item.candidate.workerUserId,
        rank: index + 1,
        matchingScore: item.matchingScore,
        scoreBreakdown: {
          semanticScore: item.semanticScore,
          geoScore: item.geoScore,
          ratingScore: item.ratingScore,
          experienceScore: item.experienceScore,
          completionScore: item.completionScore,
        },
        metadata: {
          isSyntheticSemanticScore: true,
          renormalizedWeights: weightResolution.renormalized,
        },
      }),
    );

    return {
      modelVersion: this.modelVersion,
      providerType: this.providerType,
      rankedWorkers,
      generatedAt: new Date().toISOString(),
    };
  }
}
