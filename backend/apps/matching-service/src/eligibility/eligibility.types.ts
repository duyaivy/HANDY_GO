export interface WorkerServiceAreaInput {
  latitude: number;
  longitude: number;
  radiusKm: number;
  isActive: boolean;
}

export interface WorkerCandidateEligibilityInput {
  workerUserId: string;
  workerProfileId: string;
  userStatus: string; // 'active' | 'suspended' | 'deleted'
  workerProfileStatus: string; // 'draft' | 'pending_verification' | 'verified' | 'rejected'
  hasApprovedKyc: boolean;
  hasActiveMatchingOffering: boolean;
  serviceAreas: WorkerServiceAreaInput[];
  isRestricted?: boolean;
}

export interface EligibilityRequestInput {
  serviceRequestId: string;
  serviceId: string;
  customerUserId: string;
  latitude: number;
  longitude: number;
}

export interface WorkerEligibilityResult {
  workerUserId: string;
  isEligible: boolean;
  reasons: string[];
  minimumDistanceKm?: number;
  matchedArea?: WorkerServiceAreaInput;
}
