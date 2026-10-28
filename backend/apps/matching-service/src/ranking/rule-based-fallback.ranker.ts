import { Injectable, Logger } from '@nestjs/common';
import type { IRankingProvider } from './ranking-provider.interface.js';
import type {
  RankingRequestDto,
  RankingResponseDto,
  RankedWorkerOutput,
} from './ranking.dto.js';
import { FeatureBuilderService } from '../features/feature-builder.service.js';

@Injectable()
export class RuleBasedFallbackRanker implements IRankingProvider {
  private readonly logger = new Logger(RuleBasedFallbackRanker.name);

  readonly providerType = 'fallback' as const;
  readonly modelVersion = 'rule-based-fallback-v1.0';

  constructor(private readonly featureBuilder: FeatureBuilderService) {}

  async rank(
    request: RankingRequestDto,
    signal?: AbortSignal,
  ): Promise<RankingResponseDto> {
    if (signal?.aborted) {
      throw new Error(`Fallback Ranker aborted: ${signal.reason || 'aborted'}`);
    }
    const { candidates, topN = 20 } = request;

    this.logger.warn(
      `Executing RuleBasedFallbackRanker for request ${request.serviceRequestId} (${candidates.length} candidates)`,
    );

    if (candidates.length === 0) {
      return {
        modelVersion: this.modelVersion,
        providerType: this.providerType,
        rankedWorkers: [],
        generatedAt: new Date().toISOString(),
      };
    }

    // Fallback heuristic weights: Proximity (45%), Rating (35%), Experience (20%)
    const scoredCandidates = candidates.map((candidate) => {
      const geoScore = this.featureBuilder.calculateGeoScore(
        candidate.distanceKm,
        candidate.radiusKm,
      );
      const ratingFeatures = this.featureBuilder.buildCandidateFeatures(
        candidate,
        false,
      );
      const ratingScore = ratingFeatures.ratingScore;
      const experienceScore = ratingFeatures.experienceScore;

      const fallbackScore =
        0.45 * geoScore + 0.35 * ratingScore + 0.2 * experienceScore;

      return {
        candidate,
        matchingScore: Math.round(fallbackScore * 100) / 100,
        geoScore,
        ratingScore,
        experienceScore,
      };
    });

    // Stable sort
    scoredCandidates.sort((a, b) => {
      if (b.matchingScore !== a.matchingScore) {
        return b.matchingScore - a.matchingScore;
      }
      return a.candidate.distanceKm - b.candidate.distanceKm;
    });

    const limited = scoredCandidates.slice(0, Math.min(20, topN));

    const rankedWorkers: RankedWorkerOutput[] = limited.map((item, idx) => ({
      workerUserId: item.candidate.workerUserId,
      rank: idx + 1,
      matchingScore: item.matchingScore,
      scoreBreakdown: {
        semanticScore: 0.0, // Not evaluated in rule-based fallback
        geoScore: item.geoScore,
        ratingScore: item.ratingScore,
        experienceScore: item.experienceScore,
        completionScore: 0.0,
      },
      metadata: {
        isSyntheticSemanticScore: false,
        renormalizedWeights: false,
      },
    }));

    return {
      modelVersion: this.modelVersion,
      providerType: this.providerType,
      rankedWorkers,
      generatedAt: new Date().toISOString(),
    };
  }
}
