import { describe, expect, it } from 'vitest';
import {
  calculateBayesianSmoothedRating,
  normalizeRatingScore,
} from '../src/features/bayesian-rating.util.js';
import { FeatureBuilderService } from '../src/features/feature-builder.service.js';
import { BASELINE_FEATURE_WEIGHTS } from '../src/features/feature.types.js';

describe('Bayesian Rating Smoothing Utility', () => {
  it('should assign platform prior mean (4.5) to cold-start worker with 0 reviews', () => {
    const smoothed = calculateBayesianSmoothedRating(0, 0, 4.5, 5);
    expect(smoothed).toBe(4.5);

    const score = normalizeRatingScore(smoothed);
    // (4.5 - 1.0) / 4.0 * 100 = 87.5
    expect(score).toBe(87.5);
  });

  it('should pull single 5.0 rating towards prior mean', () => {
    // Worker with 1 review of 5.0: (5*4.5 + 5.0*1) / (5 + 1) = 27.5 / 6 = 4.583
    const smoothed = calculateBayesianSmoothedRating(5.0, 1, 4.5, 5);
    expect(smoothed).toBeCloseTo(4.583, 2);
  });

  it('should approach raw rating when rating count is large (high confidence)', () => {
    // Worker with 100 reviews averaging 4.9: (5*4.5 + 4.9*100) / (5 + 100) = (22.5 + 490) / 105 = 4.88
    const smoothed = calculateBayesianSmoothedRating(4.9, 100, 4.5, 5);
    expect(smoothed).toBeCloseTo(4.88, 1);
  });

  it('should normalize 1.0 rating to score 0.0 and 5.0 rating to score 100.0', () => {
    expect(normalizeRatingScore(1.0)).toBe(0.0);
    expect(normalizeRatingScore(5.0)).toBe(100.0);
  });
});

describe('FeatureBuilderService Normalization & Weight Renormalization', () => {
  const featureBuilder = new FeatureBuilderService();

  it('should correctly calculate Geographical Suitability score', () => {
    // d = 0 -> 100.0
    expect(featureBuilder.calculateGeoScore(0, 10)).toBe(100.0);
    // d = 5, R = 10 -> (1 - 5/10) * 100 = 50.0
    expect(featureBuilder.calculateGeoScore(5, 10)).toBe(50.0);
    // d = 10, R = 10 -> boundary -> 0.0
    expect(featureBuilder.calculateGeoScore(10, 10)).toBe(0.0);
    // d > R -> 0.0
    expect(featureBuilder.calculateGeoScore(15, 10)).toBe(0.0);
  });

  it('should correctly calculate Service-Specific Experience score capped at 10 years', () => {
    expect(featureBuilder.calculateExperienceScore(0)).toBe(0.0);
    expect(featureBuilder.calculateExperienceScore(3)).toBe(30.0);
    expect(featureBuilder.calculateExperienceScore(10)).toBe(100.0);
    expect(featureBuilder.calculateExperienceScore(25)).toBe(100.0); // Capped at 100
  });

  it('should preserve Vietnamese diacritics and normalize whitespace', () => {
    const raw = '   Sửa   chữa    điện nước   tại nhà   TP.HCM   ';
    const normalized = featureBuilder.normalizeText(raw);
    expect(normalized).toBe('Sửa chữa điện nước tại nhà TP.HCM');
  });

  it('should renormalize remaining 4 weights when completion performance is globally unavailable', () => {
    const rawCandidates = [
      {
        workerUserId: 'w-1',
        offeringTitle: 'Thợ điện chuyên nghiệp',
        offeringDescription: 'Kinh nghiệm lâu năm',
        distanceKm: 2.0,
        radiusKm: 10.0,
        averageRating: 4.8,
        ratingCount: 15,
        experienceYears: 5,
        // historicalCompletionRate is undefined across all candidates
      },
    ];

    const result = featureBuilder.resolveActiveWeights(rawCandidates, false);

    expect(result.renormalized).toBe(true);
    expect(result.disabledFeatures).toContain('completion');

    // Expected renormalized weights (sum = 1.0)
    // total active = 0.30 + 0.25 + 0.20 + 0.15 = 0.90
    expect(result.weights.semantic).toBeCloseTo(0.3 / 0.9, 4); // ~0.3333
    expect(result.weights.geo).toBeCloseTo(0.25 / 0.9, 4); // ~0.2778
    expect(result.weights.rating).toBeCloseTo(0.2 / 0.9, 4); // ~0.2222
    expect(result.weights.experience).toBeCloseTo(0.15 / 0.9, 4); // ~0.1667
    expect(result.weights.completion).toBe(0.0);

    const sum =
      result.weights.semantic +
      result.weights.geo +
      result.weights.rating +
      result.weights.experience +
      result.weights.completion;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('should maintain baseline weights when completion performance is enabled and available', () => {
    const rawCandidates = [
      {
        workerUserId: 'w-1',
        offeringTitle: 'Thợ điện',
        offeringDescription: 'Chuyên nghiệp',
        distanceKm: 2.0,
        radiusKm: 10.0,
        averageRating: 4.8,
        ratingCount: 15,
        experienceYears: 5,
        historicalCompletionRate: 0.95,
      },
    ];

    const result = featureBuilder.resolveActiveWeights(rawCandidates, true);
    expect(result.renormalized).toBe(false);
    expect(result.weights).toEqual(BASELINE_FEATURE_WEIGHTS);
  });
});
