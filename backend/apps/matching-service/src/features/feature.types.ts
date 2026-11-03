export interface FeatureWeights {
  semantic: number;   // Baseline: 0.30 (30%)
  geo: number;        // Baseline: 0.25 (25%)
  rating: number;     // Baseline: 0.20 (20%)
  experience: number; // Baseline: 0.15 (15%)
  completion: number; // Baseline: 0.10 (10%)
}

export const BASELINE_FEATURE_WEIGHTS: FeatureWeights = {
  semantic: 0.30,
  geo: 0.25,
  rating: 0.20,
  experience: 0.15,
  completion: 0.10,
};

export interface FeatureAvailabilityMetadata {
  isSemanticAvailable: boolean;
  isGeoAvailable: boolean;
  isRatingAvailable: boolean;
  isExperienceAvailable: boolean;
  isCompletionAvailable: boolean;
}

export interface RawCandidateFeatures {
  workerUserId: string;
  offeringTitle: string;
  offeringDescription: string;
  distanceKm: number;
  radiusKm: number;
  averageRating: number;
  ratingCount: number;
  experienceYears: number;
  completedOrderCount?: number;
  historicalCompletionRate?: number; // e.g. 0.95 (95%)
}

export interface NormalizedCandidateFeatures {
  workerUserId: string;
  geoScore: number;         // [0, 100]
  ratingScore: number;      // [0, 100]
  experienceScore: number;  // [0, 100]
  completionScore?: number; // [0, 100], undefined if feature disabled/unavailable
  cleanedOfferingText: string;
  availability: FeatureAvailabilityMetadata;
}

export interface ActiveWeightsResult {
  weights: FeatureWeights;
  renormalized: boolean;
  disabledFeatures: string[];
}
