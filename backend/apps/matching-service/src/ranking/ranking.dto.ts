export interface RankingCandidateInput {
  workerUserId: string;
  offeringTitle: string;
  offeringDescription: string;
  distanceKm: number;
  radiusKm: number;
  averageRating: number;
  ratingCount: number;
  experienceYears: number;
  historicalCompletionRate?: number;
}

export interface RankingRequestDto {
  serviceRequestId: string;
  requestRevision: number;
  serviceId: string;
  requestDescription: string;
  requestLatitude: number;
  requestLongitude: number;
  candidates: RankingCandidateInput[];
  topN?: number; // Persisted limit, default 20
  simulationOptions?: {
    simulateTimeoutMs?: number;
    simulateError?: boolean;
    simulateEmpty?: boolean;
  };
}

export interface ScoreBreakdownDto {
  semanticScore: number;
  geoScore: number;
  ratingScore: number;
  experienceScore: number;
  completionScore: number;
}

export interface RankedWorkerOutput {
  workerUserId: string;
  rank: number; // 1 to 20
  matchingScore: number; // 0.00 to 100.00
  scoreBreakdown: ScoreBreakdownDto;
  metadata?: {
    isSyntheticSemanticScore?: boolean;
    renormalizedWeights?: boolean;
  };
}

export interface RankingResponseDto {
  modelVersion: string;
  providerType: 'mock' | 'fallback' | 'real_ai';
  rankedWorkers: RankedWorkerOutput[];
  generatedAt: string;
}
