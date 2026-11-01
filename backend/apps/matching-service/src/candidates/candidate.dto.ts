export interface WorkerCandidateDto {
  workerUserId: string;        // users.id
  workerProfileId: string;     // worker_profiles.id
  offeringTitle: string;
  offeringDescription: string;
  experienceYears: number;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  distanceKm: number;
  averageRating: number;
  ratingCount: number;
  completedOrderCount: number;
  userStatus?: string;
  workerProfileStatus?: string;
  hasApprovedKyc?: boolean;
}

export interface WorkerMatchProfileDto {
  workerUserId: string;
  workerProfileId: string;
  isVerified: boolean;
  serviceIds: string[];
  serviceAreas: Array<{
    latitude: number;
    longitude: number;
    radiusKm: number;
  }>;
}
