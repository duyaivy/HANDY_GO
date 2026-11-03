import type { CandidatesDataDto, CandidatesResponse } from '../types/candidate.types';
import { ApiClient } from '@/services/api/api-client';

export type GetCandidatesParams = {
  page?: number;
  limit?: number;
};

export const CandidatesApi = {
  /**
   * Fetch Candidates Aggregation for a given service request (BFF).
   * Aggregates Section A (Bidding bids) and Section B (AI Top 5 Recommendations).
   */
  getCandidates: async (
    requestId: string,
    params?: GetCandidatesParams,
    signal?: AbortSignal,
  ): Promise<CandidatesResponse> => {
    return ApiClient.get<CandidatesResponse>(
      `/requests/${encodeURIComponent(requestId)}/candidates`,
      { params, signal },
    );
  },

  getCandidatesData: async (
    requestId: string,
    params?: GetCandidatesParams,
    signal?: AbortSignal,
  ): Promise<CandidatesDataDto> => {
    const res = await CandidatesApi.getCandidates(requestId, params, signal);
    return res.data;
  },
};
