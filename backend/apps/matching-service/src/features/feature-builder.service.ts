import { Injectable, Logger } from '@nestjs/common';
import {
  BASELINE_FEATURE_WEIGHTS,
  type ActiveWeightsResult,
  type FeatureWeights,
  type NormalizedCandidateFeatures,
  type RawCandidateFeatures,
} from './feature.types.js';
import {
  calculateBayesianSmoothedRating,
  normalizeRatingScore,
} from './bayesian-rating.util.js';

@Injectable()
export class FeatureBuilderService {
  private readonly logger = new Logger(FeatureBuilderService.name);

  /**
   * Normalizes raw textual inputs while strictly preserving Vietnamese diacritics
   * and relevant domain terminology.
   */
  normalizeText(text?: string | null): string {
    if (!text) return '';
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // strip control characters
  }

  /**
   * Calculates normalized Geographical Suitability score:
   * S_geo = max(0, min(100, (1 - d / R) * 100))
   */
  calculateGeoScore(distanceKm: number, radiusKm: number): number {
    if (radiusKm <= 0 || distanceKm < 0) return 0.0;
    const ratio = distanceKm / radiusKm;
    if (ratio >= 1.0) return 0.0;
    const score = (1.0 - ratio) * 100.0;
    return Math.round(Math.max(0.0, Math.min(100.0, score)) * 100) / 100;
  }

  /**
   * Calculates normalized Service-Specific Experience score:
   * S_exp = min(100, (Y / 10) * 100)
   */
  calculateExperienceScore(experienceYears?: number | null): number {
    const years = Math.max(0, experienceYears || 0);
    const score = Math.min(100.0, (years / 10.0) * 100.0);
    return Math.round(score * 100) / 100;
  }

  /**
   * Resolves active weights across the candidate pool.
   * If a feature is globally unavailable across all candidates (e.g., Order completion rate
   * during platform cold-start), the feature is disabled and remaining weights are renormalized.
   */
  resolveActiveWeights(
    candidates: RawCandidateFeatures[],
    isCompletionGloballyAvailable = false,
  ): ActiveWeightsResult {
    const disabledFeatures: string[] = [];

    // Check if completion rate is globally available
    const hasAnyCompletionData =
      isCompletionGloballyAvailable &&
      candidates.some((c) => c.historicalCompletionRate !== undefined);

    if (!hasAnyCompletionData) {
      disabledFeatures.push('completion');
    }

    if (disabledFeatures.length === 0) {
      return {
        weights: { ...BASELINE_FEATURE_WEIGHTS },
        renormalized: false,
        disabledFeatures: [],
      };
    }

    // Renormalize active weights
    let totalActiveWeight = 0;
    const tempWeights = { ...BASELINE_FEATURE_WEIGHTS };

    for (const feat of disabledFeatures) {
      (tempWeights as any)[feat] = 0;
    }

    for (const [feat, val] of Object.entries(tempWeights)) {
      if (!disabledFeatures.includes(feat)) {
        totalActiveWeight += val;
      }
    }

    const renormalized: FeatureWeights = {
      semantic: tempWeights.semantic / totalActiveWeight,
      geo: tempWeights.geo / totalActiveWeight,
      rating: tempWeights.rating / totalActiveWeight,
      experience: tempWeights.experience / totalActiveWeight,
      completion: tempWeights.completion / totalActiveWeight,
    };

    return {
      weights: renormalized,
      renormalized: true,
      disabledFeatures,
    };
  }

  /**
   * Transforms raw candidate data into normalized feature representations.
   */
  buildCandidateFeatures(
    raw: RawCandidateFeatures,
    includeCompletion: boolean,
  ): NormalizedCandidateFeatures {
    const geoScore = this.calculateGeoScore(raw.distanceKm, raw.radiusKm);
    const smoothedRating = calculateBayesianSmoothedRating(
      raw.averageRating,
      raw.ratingCount,
    );
    const ratingScore = normalizeRatingScore(smoothedRating);
    const experienceScore = this.calculateExperienceScore(raw.experienceYears);

    let completionScore: number | undefined;
    if (includeCompletion) {
      if (raw.historicalCompletionRate !== undefined) {
        completionScore = Math.round(
          Math.max(0.0, Math.min(100.0, raw.historicalCompletionRate * 100)) * 100,
        ) / 100;
      } else {
        // Neutral prior for individual worker cold-start (80.0% completion baseline)
        completionScore = 80.0;
      }
    }

    const cleanedTitle = this.normalizeText(raw.offeringTitle);
    const cleanedDesc = this.normalizeText(raw.offeringDescription);
    const cleanedOfferingText = `${cleanedTitle}: ${cleanedDesc}`.trim();

    return {
      workerUserId: raw.workerUserId,
      geoScore,
      ratingScore,
      experienceScore,
      completionScore,
      cleanedOfferingText,
      availability: {
        isSemanticAvailable: true,
        isGeoAvailable: true,
        isRatingAvailable: true,
        isExperienceAvailable: true,
        isCompletionAvailable: includeCompletion,
      },
    };
  }
}
