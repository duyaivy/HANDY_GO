export const candidateQueryKeys = {
  all: ['candidates'] as const,
  byRequest: (requestId: string) => [...candidateQueryKeys.all, 'request', requestId] as const,
  candidatesList: (requestId: string, page = 1, limit = 20) =>
    [...candidateQueryKeys.byRequest(requestId), 'list', { page, limit }] as const,
  roundStatus: (requestId: string) =>
    [...candidateQueryKeys.byRequest(requestId), 'round-status'] as const,
};

export const workerBiddingKeys = {
  all: ['worker-bidding'] as const,
  myBids: (params?: Record<string, unknown>) => [...workerBiddingKeys.all, 'my-bids', params] as const,
  bidDetail: (bidId: string) => [...workerBiddingKeys.all, 'detail', bidId] as const,
  requestBids: (requestId: string) => [...workerBiddingKeys.all, 'request-bids', requestId] as const,
  discoverableRequests: (params?: Record<string, unknown>) =>
    [...workerBiddingKeys.all, 'discoverable', params] as const,
};
