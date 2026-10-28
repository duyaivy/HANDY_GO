import type { GetCandidatesParams } from '../api/candidates.api';
import type { CandidatesDataDto } from '../types/candidate.types';
import { useQuery } from '@tanstack/react-query';
import { CandidatesApi } from '../api/candidates.api';
import { candidateQueryKeys } from './candidate-query-keys';

export type UseCandidatesOptions = GetCandidatesParams & {
  enabled?: boolean;
  refetchInterval?: number | false;
};

export function useCandidates(
  requestId?: string | null,
  options?: UseCandidatesOptions,
) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;
  const isEnabled = Boolean(requestId) && (options?.enabled ?? true);

  const query = useQuery<CandidatesDataDto, Error>({
    queryKey: candidateQueryKeys.candidatesList(requestId || '', page, limit),
    queryFn: ({ signal }) => {
      if (!requestId) {
        throw new Error('Mã yêu cầu không hợp lệ');
      }
      return CandidatesApi.getCandidatesData(requestId, { page, limit }, signal);
    },
    enabled: isEnabled,
    refetchInterval: options?.refetchInterval,
  });

  return {
    ...query,
    candidates: query.data,
    bids: query.data?.bidding?.items ?? [],
    recommendations: query.data?.matching?.recommendations ?? [],
    biddingStatus: query.data?.bidding?.status,
    matchingStatus: query.data?.matching?.status,
    closesAt: query.data?.bidding?.closesAt,
    isPartial: query.data?.partial ?? false,
    partialFailures: query.data?.partialFailures ?? [],
  };
}
