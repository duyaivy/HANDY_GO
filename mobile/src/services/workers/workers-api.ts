import type { ApiResponse } from '@/services/auth/auth-api';
import { ApiClient } from '@/services/api/api-client';

export type WorkerReviewCustomer = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
};

export type WorkerReviewItem = {
  id: string;
  orderId?: string | null;
  rating: number;
  attitudeRating?: number | null;
  qualityRating?: number | null;
  speedRating?: number | null;
  comment?: string | null;
  createdAt: string;
  customer: WorkerReviewCustomer;
};

export type WorkerRatingDistribution = Record<number, number>;

export type WorkerPublicProfileStats = {
  averageRating: number;
  ratingCount: number;
  completedOrderCount: number;
  orderCountTotal: number;
  ratingDistribution: WorkerRatingDistribution;
};

export type WorkerPublicProfileData = {
  id: string;
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  status: string;
  isVerified: boolean;
  verifiedAt?: string | null;
  approvedAt?: string | null;
  memberSince?: string | null;
  stats: WorkerPublicProfileStats;
  recentReviews?: WorkerReviewItem[];
};

export type WorkerReviewsListResponse = {
  statusCode: number;
  data: WorkerReviewItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export const WorkersApi = {
  getWorkerPublicProfile: async (workerIdentifier: string): Promise<ApiResponse<WorkerPublicProfileData>> => {
    return ApiClient.get<ApiResponse<WorkerPublicProfileData>>(`/workers/${workerIdentifier}`);
  },

  getWorkerReviews: async (
    workerIdentifier: string,
    query?: { rating?: number; page?: number; limit?: number },
  ): Promise<WorkerReviewsListResponse> => {
    const params = new URLSearchParams();
    if (query?.rating !== undefined && query?.rating !== null) {
      params.append('rating', String(query.rating));
    }
    if (query?.page) {
      params.append('page', String(query.page));
    }
    if (query?.limit) {
      params.append('limit', String(query.limit));
    }
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return ApiClient.get<WorkerReviewsListResponse>(`/workers/${workerIdentifier}/reviews${queryString}`);
  },
};

