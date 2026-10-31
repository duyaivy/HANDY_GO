import { ApiClient } from '@/services/api/api-client';

export type DiscoverableJobItem = {
  id: string;
  requestCode: string;
  serviceId?: string | null;
  serviceName?: string | null;
  categoryName?: string | null;
  description?: string | null;
  distanceKm?: number | null;
  scheduledAt?: string | null;
  addressText?: string | null;
  biddingClosesAt?: string | null;
  createdAt: string;
};

export type DiscoverableJobsResponseData = {
  items: DiscoverableJobItem[];
  total: number;
  page: number;
  limit: number;
};

export type WorkerDiscoveryParams = {
  page?: number;
  limit?: number;
};

export type DiscoverableJobsEnvelope = {
  statusCode: number;
  message: string;
  data: DiscoverableJobsResponseData;
};

export const WorkerDiscoveryApi = {
  /**
   * Worker Job Discovery Feed (Contract Section 3.2).
   * GET /api/v1/matching/me/requests
   * Returns open service requests within worker's registered service area and trades.
   */
  getDiscoverableRequests: async (
    params?: WorkerDiscoveryParams,
    signal?: AbortSignal,
  ): Promise<DiscoverableJobsEnvelope> => {
    return ApiClient.get<DiscoverableJobsEnvelope>('/matching/me/requests', {
      params,
      signal,
    });
  },

  getDiscoverableRequestsData: async (
    params?: WorkerDiscoveryParams,
    signal?: AbortSignal,
  ): Promise<DiscoverableJobsResponseData> => {
    const res = await WorkerDiscoveryApi.getDiscoverableRequests(params, signal);
    return res.data;
  },
};
