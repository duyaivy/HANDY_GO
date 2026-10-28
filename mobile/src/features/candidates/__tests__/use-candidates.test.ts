import type { CandidatesDataDto } from '../types/candidate.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { CandidatesApi } from '../api/candidates.api';
import { candidateQueryKeys } from '../hooks/candidate-query-keys';
import { useCandidates } from '../hooks/use-candidates';

// Mock ApiClient
jest.mock('@/services/api/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
  },
  resolveApiBaseUrl: jest.fn(() => 'http://127.0.0.1:3000/api/v1'),
}));

const mockCandidatesData: CandidatesDataDto = {
  requestId: 'req-test-123',
  requestStatus: 'open_for_bidding',
  bidding: {
    status: 'open',
    closesAt: '2026-10-29T10:00:00.000Z',
    total: 1,
    page: 1,
    limit: 20,
    items: [
      {
        selectionSource: 'bid',
        sourceBidId: 'bid-111',
        workerUserId: 'worker-111',
        id: 'bid-111',
        biddingRoundId: 'round-111',
        serviceRequestId: 'req-test-123',
        workerId: 'worker-111',
        amount: 250000,
        message: 'Tôi có thể làm ngay',
        validUntil: '2026-10-29T10:00:00.000Z',
        status: 'active',
        version: 1,
        submittedAt: '2026-10-28T09:30:00.000Z',
        revisionsCount: 0,
        isMasked: false,
        workerProfile: {
          fullName: 'Nguyễn Văn Thợ',
          averageRating: 4.9,
          ratingCount: 15,
          completedOrderCount: 12,
          distanceKm: 1.8,
        },
      },
    ],
  },
  matching: {
    status: 'completed',
    displayLimit: 5,
    recommendations: [
      {
        selectionSource: 'recommendation',
        sourceMatchResultId: 'match-222',
        workerUserId: 'worker-222',
        rank: 1,
        matchingScore: 94.5,
        scoreBreakdown: {
          semanticScore: 90,
          geoScore: 98,
        },
        workerProfile: null,
      },
    ],
    modelVersion: 'multilingual-e5-small-v1',
    generatedAt: '2026-10-28T09:35:00.000Z',
  },
  partial: false,
};

describe('Candidates Aggregation & useCandidates Hook Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('candidateQueryKeys contract', () => {
    it('should generate expected query keys per Contract Section 11', () => {
      const requestId = 'req-123';
      expect(candidateQueryKeys.all).toEqual(['candidates']);
      expect(candidateQueryKeys.byRequest(requestId)).toEqual(['candidates', 'request', 'req-123']);
      expect(candidateQueryKeys.candidatesList(requestId, 1, 20)).toEqual([
        'candidates',
        'request',
        'req-123',
        'list',
        { page: 1, limit: 20 },
      ]);
      expect(candidateQueryKeys.roundStatus(requestId)).toEqual([
        'candidates',
        'request',
        'req-123',
        'round-status',
      ]);
    });
  });

  describe('CandidatesApi', () => {
    it('should call GET /api/v1/requests/:requestId/candidates with params', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: mockCandidatesData,
      });

      const res = await CandidatesApi.getCandidatesData('req-test-123', { page: 1, limit: 10 });
      expect(ApiClient.get).toHaveBeenCalledWith('/requests/req-test-123/candidates', {
        params: { page: 1, limit: 10 },
        signal: undefined,
      });
      expect(res.requestId).toBe('req-test-123');
      expect(res.bidding.items.length).toBe(1);
      expect(res.matching.recommendations.length).toBe(1);
    });
  });

  describe('useCandidates hook', () => {
    it('should fetch candidates successfully and expose structured fields', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: mockCandidatesData,
      });

      const { result } = renderHook(() => useCandidates('req-test-123'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.bids.length).toBe(1);
      expect(result.current.bids[0].workerUserId).toBe('worker-111');
      expect(result.current.recommendations.length).toBe(1);
      expect(result.current.recommendations[0].workerUserId).toBe('worker-222');
      expect(result.current.biddingStatus).toBe('open');
      expect(result.current.matchingStatus).toBe('completed');
      expect(result.current.isPartial).toBe(false);
    });

    it('should not execute query when requestId is null or disabled', () => {
      const { ApiClient } = require('@/services/api/api-client');
      const { result } = renderHook(() => useCandidates(null), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isFetching).toBe(false);
      expect(ApiClient.get).not.toHaveBeenCalled();
    });

    it('should handle partial failure state gracefully (Contract Section 6.2)', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: {
          ...mockCandidatesData,
          partial: true,
          bidding: {
            status: 'unavailable',
            items: [],
            total: 0,
            page: 1,
            limit: 20,
          },
        },
      });

      const { result } = renderHook(() => useCandidates('req-partial-test'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isPartial).toBe(true);
      expect(result.current.biddingStatus).toBe('unavailable');
      expect(result.current.bids).toEqual([]);
      expect(result.current.recommendations.length).toBe(1);
    });
  });
});
