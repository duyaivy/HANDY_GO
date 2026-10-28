import type {
  BidDetail,
  BiddingRoundStatus,
  ReviseBidPayload,
  SubmitBidPayload,
  WithdrawBidPayload,
} from '../api/worker-bidding.api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { candidateQueryKeys, workerBiddingKeys } from '@/features/candidates/hooks/candidate-query-keys';
import { WorkerBiddingApi } from '../api/worker-bidding.api';

/**
 * Hook to fetch the bidding round status for a given service request.
 */
export function useRoundStatus(requestId?: string | null, enabled = true) {
  return useQuery<BiddingRoundStatus, Error>({
    queryKey: candidateQueryKeys.roundStatus(requestId || ''),
    queryFn: ({ signal }) => {
      if (!requestId) {
        throw new Error('Mã yêu cầu không hợp lệ');
      }
      return WorkerBiddingApi.getRoundStatus(requestId, signal);
    },
    enabled: Boolean(requestId) && enabled,
    refetchInterval: 15000, // Poll every 15s as fallback if SSE is disconnected
  });
}

/**
 * Hook to fetch bids submitted by the authenticated worker.
 */
export function useMyBids(params?: Record<string, unknown>, enabled = true) {
  return useQuery<BidDetail[], Error>({
    queryKey: workerBiddingKeys.myBids(params),
    queryFn: ({ signal }) => WorkerBiddingApi.getMyBids(params, signal),
    enabled,
  });
}

/**
 * Hook to fetch single bid details.
 */
export function useBidDetail(bidId?: string | null, enabled = true) {
  return useQuery<BidDetail, Error>({
    queryKey: workerBiddingKeys.bidDetail(bidId || ''),
    queryFn: ({ signal }) => {
      if (!bidId) {
        throw new Error('Mã báo giá không hợp lệ');
      }
      return WorkerBiddingApi.getBidDetail(bidId, signal);
    },
    enabled: Boolean(bidId) && enabled,
  });
}

/**
 * Hook to submit a new bid.
 */
export function useSubmitBid(requestId: string) {
  const queryClient = useQueryClient();

  return useMutation<BidDetail, Error, SubmitBidPayload>({
    mutationFn: (payload: SubmitBidPayload) => WorkerBiddingApi.submitBid(requestId, payload),
    onSuccess: (newBid) => {
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.requestBids(requestId),
      });
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.myBids(),
      });
      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.byRequest(requestId),
      });
      void queryClient.invalidateQueries({
        queryKey: candidateQueryKeys.roundStatus(requestId),
      });
    },
  });
}

/**
 * Hook to revise an existing bid with optimistic concurrency version check.
 */
export function useReviseBid(requestId?: string) {
  const queryClient = useQueryClient();

  return useMutation<BidDetail, Error, { bidId: string; payload: ReviseBidPayload }>({
    mutationFn: ({ bidId, payload }) => WorkerBiddingApi.reviseBid(bidId, payload),
    onSuccess: (updatedBid) => {
      if (requestId) {
        void queryClient.invalidateQueries({
          queryKey: workerBiddingKeys.requestBids(requestId),
        });
        void queryClient.invalidateQueries({
          queryKey: candidateQueryKeys.byRequest(requestId),
        });
        void queryClient.invalidateQueries({
          queryKey: candidateQueryKeys.roundStatus(requestId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.bidDetail(updatedBid.id),
      });
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.myBids(),
      });
    },
  });
}

/**
 * Hook to withdraw an active bid with optimistic concurrency version check.
 */
export function useWithdrawBid(requestId?: string) {
  const queryClient = useQueryClient();

  return useMutation<BidDetail, Error, { bidId: string; payload: WithdrawBidPayload }>({
    mutationFn: ({ bidId, payload }) => WorkerBiddingApi.withdrawBid(bidId, payload),
    onSuccess: (withdrawnBid) => {
      if (requestId) {
        void queryClient.invalidateQueries({
          queryKey: workerBiddingKeys.requestBids(requestId),
        });
        void queryClient.invalidateQueries({
          queryKey: candidateQueryKeys.byRequest(requestId),
        });
        void queryClient.invalidateQueries({
          queryKey: candidateQueryKeys.roundStatus(requestId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.bidDetail(withdrawnBid.id),
      });
      void queryClient.invalidateQueries({
        queryKey: workerBiddingKeys.myBids(),
      });
    },
  });
}
