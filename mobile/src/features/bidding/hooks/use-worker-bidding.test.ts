import { ApiClient } from '@/services/api/api-client';
import { WorkerBiddingApi } from '../api/worker-bidding.api';

// Mock ApiClient
jest.mock('@/services/api/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  resolveApiBaseUrl: jest.fn().mockReturnValue('http://localhost:3000'),
}));

describe('Worker Bidding API & Hooks (FIX-04 Worker Home Bid Status & Pagination)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. WorkerBiddingApi.getMyBidForRequest', () => {
    it('queries /bids/me with authoritative serviceRequestId filter and limit=1', async () => {
      const mockBid = {
        id: 'bid-123',
        serviceRequestId: 'req-456',
        workerId: 'worker-789',
        amount: 350000,
        status: 'active',
        version: 1,
        submittedAt: '2026-11-03T10:00:00.000Z',
        revisionsCount: 0,
      };

      (ApiClient.get as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: {
          items: [mockBid],
          total: 1,
          page: 1,
          limit: 1,
        },
      });

      const result = await WorkerBiddingApi.getMyBidForRequest('req-456');

      expect(ApiClient.get).toHaveBeenCalledWith('/bids/me', {
        params: { serviceRequestId: 'req-456', limit: 1 },
        signal: undefined,
      });
      expect(result).toEqual(mockBid);
    });

    it('returns null when the current worker has not bid on this request', async () => {
      (ApiClient.get as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: {
          items: [],
          total: 0,
          page: 1,
          limit: 1,
        },
      });

      const result = await WorkerBiddingApi.getMyBidForRequest('req-no-bid');
      expect(result).toBeNull();
    });

    it('works accurately when worker has more than 50 historical bids (no pagination miss)', async () => {
      // Worker has 60 bids total in database; this target request bid would have been on page 3.
      // Server-side filtering guarantees it is returned directly as item[0].
      const mockTargetBid = {
        id: 'bid-on-page-3',
        serviceRequestId: 'req-target',
        workerId: 'worker-veteran',
        amount: 500000,
        status: 'active',
        version: 1,
        submittedAt: '2026-10-01T08:00:00.000Z',
        revisionsCount: 0,
      };

      (ApiClient.get as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: {
          items: [mockTargetBid],
          total: 1,
          page: 1,
          limit: 1,
        },
      });

      const result = await WorkerBiddingApi.getMyBidForRequest('req-target');

      expect(ApiClient.get).toHaveBeenCalledWith('/bids/me', {
        params: { serviceRequestId: 'req-target', limit: 1 },
        signal: undefined,
      });
      expect(result).toEqual(mockTargetBid);
      expect(result?.status).toBe('active');
    });

    it('handles array response envelopes gracefully', async () => {
      const mockBid = {
        id: 'bid-array',
        serviceRequestId: 'req-arr',
        workerId: 'worker-1',
        amount: 200000,
        status: 'selected',
        version: 1,
        submittedAt: '2026-11-03T10:00:00.000Z',
        revisionsCount: 0,
      };

      (ApiClient.get as jest.Mock).mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: [mockBid],
      });

      const result = await WorkerBiddingApi.getMyBidForRequest('req-arr');
      expect(result).toEqual(mockBid);
    });
  });
});
