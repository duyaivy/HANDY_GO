import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import * as React from 'react';
import { WorkerBiddingApi } from '../api/worker-bidding.api';
import {
  useMyBids,
  useReviseBid,
  useRoundStatus,
  useSubmitBid,
  useWithdrawBid,
} from '../hooks/use-worker-bidding';

// Mock ApiClient
jest.mock('@/services/api/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('Worker Bidding API & Hooks Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('WorkerBiddingApi endpoints', () => {
    it('submitBid calls POST /api/v1/requests/:id/bids with positive amount', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.post.mockResolvedValueOnce({
        statusCode: 201,
        message: 'Success',
        data: { id: 'bid-123', version: 1, amount: 200000, status: 'active' },
      });

      const res = await WorkerBiddingApi.submitBid('req-1', {
        amount: 200000,
        message: 'Báo giá tốt',
      });

      expect(ApiClient.post).toHaveBeenCalledWith('/requests/req-1/bids', {
        amount: 200000,
        message: 'Báo giá tốt',
      });
      expect(res.id).toBe('bid-123');
      expect(res.version).toBe(1);
    });

    it('reviseBid calls PATCH /api/v1/bids/:id with version for optimistic concurrency lock', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.patch.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: { id: 'bid-123', version: 2, amount: 180000, status: 'active' },
      });

      const res = await WorkerBiddingApi.reviseBid('bid-123', {
        version: 1,
        amount: 180000,
      });

      expect(ApiClient.patch).toHaveBeenCalledWith('/bids/bid-123', {
        version: 1,
        amount: 180000,
      });
      expect(res.version).toBe(2);
      expect(res.amount).toBe(180000);
    });

    it('handles 409 Conflict when optimistic locking version mismatches', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      const conflictError = new Error('Version mismatch conflict');
      (conflictError as any).response = {
        status: 409,
        data: { statusCode: 409, message: 'Báo giá đã được sửa đổi bởi thao tác khác' },
      };
      ApiClient.patch.mockRejectedValueOnce(conflictError);

      await expect(
        WorkerBiddingApi.reviseBid('bid-123', { version: 1, amount: 180000 }),
      ).rejects.toThrow('Version mismatch conflict');
    });

    it('withdrawBid calls POST /api/v1/bids/:id/withdraw with version', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.post.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: { id: 'bid-123', version: 2, status: 'withdrawn' },
      });

      const res = await WorkerBiddingApi.withdrawBid('bid-123', {
        version: 1,
        reason: 'Không sắp xếp được thời gian',
      });

      expect(ApiClient.post).toHaveBeenCalledWith('/bids/bid-123/withdraw', {
        version: 1,
        reason: 'Không sắp xếp được thời gian',
      });
      expect(res.status).toBe('withdrawn');
    });

    it('getRoundStatus calls GET /api/v1/requests/:id/bidding-status', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: {
          roundId: 'round-1',
          serviceRequestId: 'req-1',
          status: 'open',
          opensAt: '2026-10-28T00:00:00Z',
          closesAt: '2026-10-29T00:00:00Z',
          bidCount: 3,
          activeBidCount: 3,
          timeRemainingSeconds: 3600,
          isExpired: false,
        },
      });

      const res = await WorkerBiddingApi.getRoundStatus('req-1');
      expect(ApiClient.get).toHaveBeenCalledWith('/requests/req-1/bidding-status', {
        signal: undefined,
      });
      expect(res.status).toBe('open');
      expect(res.bidCount).toBe(3);
    });
  });

  describe('Hooks mutations and cache invalidations', () => {
    it('useSubmitBid executes mutation and invalidates related queries', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.post.mockResolvedValueOnce({
        statusCode: 201,
        message: 'Success',
        data: { id: 'bid-new', version: 1, amount: 250000, status: 'active' },
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSubmitBid('req-1'), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ amount: 250000 });
      });

      expect(result.current.isSuccess).toBe(true);
      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('useReviseBid executes mutation and invalidates related queries', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.patch.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: { id: 'bid-123', version: 2, amount: 220000, status: 'active' },
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useReviseBid('req-1'), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          bidId: 'bid-123',
          payload: { version: 1, amount: 220000 },
        });
      });

      expect(result.current.isSuccess).toBe(true);
      expect(invalidateSpy).toHaveBeenCalled();
    });

    it('useWithdrawBid executes mutation and invalidates related queries', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.post.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: { id: 'bid-123', version: 2, status: 'withdrawn' },
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWithdrawBid('req-1'), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({
          bidId: 'bid-123',
          payload: { version: 1, reason: 'Bận việc' },
        });
      });

      expect(result.current.isSuccess).toBe(true);
      expect(invalidateSpy).toHaveBeenCalled();
    });
  });
});
