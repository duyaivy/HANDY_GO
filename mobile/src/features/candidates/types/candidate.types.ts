export type WorkerProfileSummary = {
  fullName: string;
  avatarUrl?: string | null;
  averageRating?: number | null;
  ratingCount?: number;
  completedOrderCount?: number;
  distanceKm?: number | null;
};

export type BidCandidate = {
  selectionSource: 'bid';
  sourceBidId: string;
  workerUserId: string;
  id: string;
  biddingRoundId: string;
  serviceRequestId: string;
  workerId: string;
  amount: number;
  message?: string | null;
  validUntil?: string | null;
  status: string;
  version: number;
  submittedAt: string;
  revisionsCount?: number;
  isMasked: boolean;
  workerProfile?: WorkerProfileSummary | null;
};

export type ScoreBreakdown = {
  semanticScore?: number;
  geoScore?: number;
  ratingScore?: number;
  experienceScore?: number;
  completionScore?: number;
  [key: string]: number | undefined;
};

export type RecommendationCandidate = {
  selectionSource: 'recommendation';
  sourceMatchResultId: string;
  workerUserId: string;
  rank: number;
  matchingScore: number;
  scoreBreakdown?: ScoreBreakdown | null;
  workerProfile?: WorkerProfileSummary | null;
};

export type BiddingSection = {
  status: string;
  closesAt?: string | null;
  total: number;
  page: number;
  limit: number;
  items: BidCandidate[];
};

export type MatchingSection = {
  status: string;
  displayLimit: number;
  recommendations: RecommendationCandidate[];
  modelVersion?: string;
  generatedAt?: string;
};

export type PartialFailureDetail = {
  service: string;
  reason: string;
  statusCode?: number;
};

export type CandidatesDataDto = {
  requestId: string;
  requestStatus: string;
  bidding: BiddingSection;
  matching: MatchingSection;
  partial: boolean;
  partialFailures?: PartialFailureDetail[];
};

export type CandidatesResponse = {
  statusCode: number;
  message: string;
  data: CandidatesDataDto;
};
