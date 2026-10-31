import type { ServiceRequest } from '@/features/orders/types/order.types';
import { ApiClient } from '@/services/api/api-client';

export type SubmitBidPayload = {
  amount: number;
  message?: string;
  validUntil?: string;
};

export type ReviseBidPayload = {
  version: number;
  amount?: number;
  message?: string;
  validUntil?: string;
};

export type WithdrawBidPayload = {
  version: number;
  reason?: string;
};

export type BidRevision = {
  id: string;
  revisionNo: number;
  previousAmount: number;
  newAmount: number;
  previousMessage?: string | null;
  newMessage?: string | null;
  revisedAt: string;
};

export type BidDetail = {
  id: string;
  biddingRoundId: string;
  serviceRequestId: string;
  workerId: string;
  amount: number;
  message?: string | null;
  validUntil?: string | null;
  status: 'active' | 'withdrawn' | 'expired' | 'selected' | 'rejected' | string;
  version: number;
  isMasked?: boolean;
  submittedAt: string;
  revisionsCount: number;
  revisions?: BidRevision[];
};

export type BiddingRoundStatus = {
  roundId: string;
  serviceRequestId: string;
  status: 'pending' | 'open' | 'closed' | 'no_bid' | 'finalized' | 'cancelled' | string;
  opensAt: string;
  closesAt: string;
  bidCount: number;
  activeBidCount: number;
  timeRemainingSeconds: number;
  isExpired: boolean;
};

type Envelope<T> = {
  statusCode: number;
  message: string;
  data: T;
};

export const WorkerBiddingApi = {
  /**
   * Inspect service request details (photos, description, address, etc.)
   * GET /api/v1/service-requests/:id
   */
  getServiceRequest: async (requestId: string, signal?: AbortSignal): Promise<ServiceRequest> => {
    const res = await ApiClient.get<Envelope<ServiceRequest>>(`/service-requests/${encodeURIComponent(requestId)}`, {
      signal,
    });
    return res.data;
  },

  /**
   * Inspect bidding round status for a request.
   * GET /api/v1/requests/:id/bidding-status
   */
  getRoundStatus: async (requestId: string, signal?: AbortSignal): Promise<BiddingRoundStatus> => {
    const res = await ApiClient.get<Envelope<BiddingRoundStatus>>(`/requests/${encodeURIComponent(requestId)}/bidding-status`, {
      signal,
    });
    return res.data;
  },

  /**
   * Submit a bid for an open service request.
   * POST /api/v1/requests/:id/bids
   */
  submitBid: async (requestId: string, payload: SubmitBidPayload): Promise<BidDetail> => {
    const res = await ApiClient.post<Envelope<BidDetail>>(`/requests/${encodeURIComponent(requestId)}/bids`, payload);
    return res.data;
  },

  /**
   * Revise an existing bid with optimistic concurrency version lock.
   * PATCH /api/v1/bids/:id
   */
  reviseBid: async (bidId: string, payload: ReviseBidPayload): Promise<BidDetail> => {
    const res = await ApiClient.patch<Envelope<BidDetail>>(`/bids/${encodeURIComponent(bidId)}`, payload);
    return res.data;
  },

  /**
   * Withdraw an active bid with optimistic concurrency version lock.
   * POST /api/v1/bids/:id/withdraw
   */
  withdrawBid: async (bidId: string, payload: WithdrawBidPayload): Promise<BidDetail> => {
    const res = await ApiClient.post<Envelope<BidDetail>>(`/bids/${encodeURIComponent(bidId)}/withdraw`, payload);
    return res.data;
  },

  /**
   * Get bids submitted by the authenticated worker.
   * GET /api/v1/bids/me
   */
  getMyBids: async (params?: Record<string, unknown>, signal?: AbortSignal): Promise<BidDetail[]> => {
    const res = await ApiClient.get<Envelope<BidDetail[] | { items: BidDetail[] }>>('/bids/me', {
      params,
      signal,
    });
    const data = res.data;
    if (Array.isArray(data)) {
      return data;
    }
    return (data as any)?.items ?? [];
  },

  /**
   * Get bid detail by ID.
   * GET /api/v1/bids/:id
   */
  getBidDetail: async (bidId: string, signal?: AbortSignal): Promise<BidDetail> => {
    const res = await ApiClient.get<Envelope<BidDetail>>(`/bids/${encodeURIComponent(bidId)}`, {
      signal,
    });
    return res.data;
  },
};
