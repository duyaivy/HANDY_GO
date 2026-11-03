import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CandidatesAggregationService } from './candidates-aggregation.service.js';
import { OrderClient, type UserContext } from './clients/order.client.js';
import { BiddingClient } from './clients/bidding.client.js';
import { MatchingClient } from './clients/matching.client.js';
import { WorkerProfilesClient } from './clients/worker-profiles.client.js';
import { AppException } from '@app/common';

describe('CandidatesAggregationService', () => {
  let service: CandidatesAggregationService;
  let mockOrderClient: { getServiceRequest: ReturnType<typeof vi.fn> };
  let mockBiddingClient: { getBidsAndStatus: ReturnType<typeof vi.fn> };
  let mockMatchingClient: { getRecommendations: ReturnType<typeof vi.fn> };

  const customerUser: UserContext = {
    userId: 'cust-uuid-1',
    roles: ['Customer'],
  };

  const adminUser: UserContext = {
    userId: 'admin-uuid-1',
    roles: ['Admin'],
  };

  const otherCustomerUser: UserContext = {
    userId: 'other-cust-uuid',
    roles: ['Customer'],
  };

  const requestId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  beforeEach(() => {
    mockOrderClient = {
      getServiceRequest: vi.fn(),
    };
    mockBiddingClient = {
      getBidsAndStatus: vi.fn(),
    };
    mockMatchingClient = {
      getRecommendations: vi.fn(),
    };

    service = new CandidatesAggregationService(
      mockOrderClient as unknown as OrderClient,
      mockBiddingClient as unknown as BiddingClient,
      mockMatchingClient as unknown as MatchingClient,
      {
        getSummaries: vi
          .fn()
          .mockResolvedValue(new Map([['w1', { fullName: 'Nguyễn Văn An' }]])),
      } as unknown as WorkerProfilesClient,
    );
  });

  // 1. Both services return successful results
  it('Requirement 1: Both services return successful results with bids and matching recommendations', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      closesAt: '2026-10-29T10:00:00.000Z',
      total: 2,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'bid-1',
          workerId: 'worker-b1',
          amount: 250000,
          submittedAt: '2026-10-28T10:00:00.000Z',
          status: 'active',
          isMasked: false,
        },
        {
          id: 'bid-2',
          workerId: 'worker-b2',
          amount: 300000,
          submittedAt: '2026-10-28T09:00:00.000Z',
          status: 'active',
          isMasked: false,
        },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      modelVersion: 'v1.0',
      generatedAt: '2026-10-28T08:30:00.000Z',
      recommendations: [
        {
          matchResultId: 'match-1',
          workerUserId: 'worker-m1',
          rank: 1,
          matchingScore: 95.5,
          scoreBreakdown: { geoScore: 90 },
        },
        {
          matchResultId: 'match-2',
          workerUserId: 'worker-m2',
          rank: 2,
          matchingScore: 91.0,
        },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.requestId).toBe(requestId);
    expect(result.requestStatus).toBe('open_for_bidding');
    expect(result.partial).toBe(false);
    expect(result.bidding.items).toHaveLength(2);
    expect(result.matching.recommendations).toHaveLength(2);
    expect(result.matching.displayLimit).toBe(5);
  });

  // 2. No bids, five valid Matching recommendations
  it('Requirement 2: No bids, returns up to 5 valid Matching recommendations', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'no_bid',
      closesAt: '2026-10-29T10:00:00.000Z',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        { matchResultId: 'm1', workerUserId: 'w1', rank: 1, matchingScore: 95 },
        { matchResultId: 'm2', workerUserId: 'w2', rank: 2, matchingScore: 90 },
        { matchResultId: 'm3', workerUserId: 'w3', rank: 3, matchingScore: 85 },
        { matchResultId: 'm4', workerUserId: 'w4', rank: 4, matchingScore: 80 },
        { matchResultId: 'm5', workerUserId: 'w5', rank: 5, matchingScore: 75 },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.bidding.items).toHaveLength(0);
    expect(result.matching.recommendations).toHaveLength(5);
    expect(result.matching.recommendations[0].workerUserId).toBe('w1');
    expect(result.matching.recommendations[0].workerProfile?.fullName).toBe(
      'Nguyễn Văn An',
    );
    expect(result.matching.recommendations[4].workerUserId).toBe('w5');
  });

  // 3. Multiple bids, Matching still processing
  it('Requirement 3: Multiple bids, Matching still processing returns bids and processing status', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 2,
      page: 1,
      limit: 20,
      items: [
        { id: 'b1', workerId: 'w1', amount: 200000, submittedAt: '2026-10-28' },
        { id: 'b2', workerId: 'w2', amount: 220000, submittedAt: '2026-10-28' },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'processing',
      recommendations: [],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.bidding.items).toHaveLength(2);
    expect(result.matching.status).toBe('processing');
    expect(result.matching.recommendations).toHaveLength(0);
    expect(result.partial).toBe(false);
  });

  // 4. Both services pending or empty
  it('Requirement 4: Both services pending or empty', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'pending',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'pending',
      recommendations: [],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.bidding.items).toHaveLength(0);
    expect(result.bidding.status).toBe('pending');
    expect(result.matching.recommendations).toHaveLength(0);
    expect(result.matching.status).toBe('pending');
  });

  // 5. Worker appears in both Bid and Matching
  it('Requirement 5: Worker in both Bid and Matching is kept in Bidding and excluded from Matching', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'bid-common',
          workerId: 'worker-duplicate',
          amount: 250000,
          submittedAt: '2026-10-28T10:00:00.000Z',
        },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        {
          matchResultId: 'match-dup',
          workerUserId: 'worker-duplicate',
          rank: 1,
          matchingScore: 98.0,
        },
        {
          matchResultId: 'match-other',
          workerUserId: 'worker-unique',
          rank: 2,
          matchingScore: 91.0,
        },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    // Kept in bidding
    expect(result.bidding.items).toHaveLength(1);
    expect(result.bidding.items[0].workerUserId).toBe('worker-duplicate');

    // Excluded from matching recommendations
    expect(result.matching.recommendations).toHaveLength(1);
    expect(result.matching.recommendations[0].workerUserId).toBe(
      'worker-unique',
    );
    expect(
      result.matching.recommendations.some(
        (r) => r.workerUserId === 'worker-duplicate',
      ),
    ).toBe(false);
  });

  it('PR34-07: Worker who bid on page 3 is globally deduplicated and excluded from Top 5 matching on page 1', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    // Page 1 bidding query returns worker-page1-bidder in items,
    // but allBidderWorkerIds contains worker-page3-bidder from page 3!
    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 25,
      page: 1,
      limit: 10,
      items: [
        {
          id: 'bid-page1',
          workerId: 'worker-page1-bidder',
          amount: 200000,
          submittedAt: '2026-10-28T10:00:00.000Z',
        },
      ],
      allBidderWorkerIds: ['worker-page1-bidder', 'worker-page3-bidder'],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        {
          matchResultId: 'match-p3',
          workerUserId: 'worker-page3-bidder', // Should be excluded because they bid on page 3!
          rank: 1,
          matchingScore: 99.0,
        },
        {
          matchResultId: 'match-clean',
          workerUserId: 'worker-non-bidder',
          rank: 2,
          matchingScore: 92.0,
        },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 10 },
      customerUser,
    );

    // worker-page3-bidder MUST be excluded from matching recommendations
    expect(
      result.matching.recommendations.some(
        (r) => r.workerUserId === 'worker-page3-bidder',
      ),
    ).toBe(false);
    expect(result.matching.recommendations).toHaveLength(1);
    expect(result.matching.recommendations[0].workerUserId).toBe(
      'worker-non-bidder',
    );
  });

  // 6. Top 5 recommendations are replenished from later ranked results after deduplication
  it('Requirement 6: Top 5 recommendations are replenished from later ranked results after deduplication', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    // 2 workers already submitted bids
    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 2,
      page: 1,
      limit: 20,
      items: [
        { id: 'b1', workerId: 'w1', amount: 100000, submittedAt: '2026-10-28' },
        { id: 'b2', workerId: 'w3', amount: 150000, submittedAt: '2026-10-28' },
      ],
    });

    // Top 20 ranking from Matching contains w1 (rank 1) and w3 (rank 3)
    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        { matchResultId: 'm1', workerUserId: 'w1', rank: 1, matchingScore: 99 }, // skipped (in bids)
        { matchResultId: 'm2', workerUserId: 'w2', rank: 2, matchingScore: 95 }, // pick 1
        { matchResultId: 'm3', workerUserId: 'w3', rank: 3, matchingScore: 90 }, // skipped (in bids)
        { matchResultId: 'm4', workerUserId: 'w4', rank: 4, matchingScore: 85 }, // pick 2
        { matchResultId: 'm5', workerUserId: 'w5', rank: 5, matchingScore: 80 }, // pick 3
        { matchResultId: 'm6', workerUserId: 'w6', rank: 6, matchingScore: 75 }, // pick 4 (replenished)
        { matchResultId: 'm7', workerUserId: 'w7', rank: 7, matchingScore: 70 }, // pick 5 (replenished)
        { matchResultId: 'm8', workerUserId: 'w8', rank: 8, matchingScore: 65 }, // excluded (already 5)
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.matching.recommendations).toHaveLength(5);
    const workerIds = result.matching.recommendations.map(
      (r) => r.workerUserId,
    );
    expect(workerIds).toEqual(['w2', 'w4', 'w5', 'w6', 'w7']);
  });

  // 7. Fewer than five eligible workers are available
  it('Requirement 7: Fewer than five eligible workers are returned without fabricating candidates', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        { matchResultId: 'm1', workerUserId: 'w1', rank: 1, matchingScore: 90 },
        { matchResultId: 'm2', workerUserId: 'w2', rank: 2, matchingScore: 85 },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.matching.recommendations).toHaveLength(2);
    expect(result.matching.recommendations.map((r) => r.workerUserId)).toEqual([
      'w1',
      'w2',
    ]);
  });

  // 8. The sixth recommendation is excluded when five valid recommendations already exist
  it('Requirement 8: The sixth recommendation is excluded when five valid recommendations exist', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        { matchResultId: 'm1', workerUserId: 'w1', rank: 1, matchingScore: 95 },
        { matchResultId: 'm2', workerUserId: 'w2', rank: 2, matchingScore: 90 },
        { matchResultId: 'm3', workerUserId: 'w3', rank: 3, matchingScore: 85 },
        { matchResultId: 'm4', workerUserId: 'w4', rank: 4, matchingScore: 80 },
        { matchResultId: 'm5', workerUserId: 'w5', rank: 5, matchingScore: 75 },
        { matchResultId: 'm6', workerUserId: 'w6', rank: 6, matchingScore: 70 },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.matching.recommendations).toHaveLength(5);
    expect(
      result.matching.recommendations.some((r) => r.workerUserId === 'w6'),
    ).toBe(false);
  });

  // 9. Matching rank order remains correct
  it('Requirement 9: Matching rank order remains descending according to AI rank', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        {
          matchResultId: 'm1',
          workerUserId: 'w1',
          rank: 1,
          matchingScore: 99.1,
        },
        {
          matchResultId: 'm2',
          workerUserId: 'w2',
          rank: 2,
          matchingScore: 88.4,
        },
        {
          matchResultId: 'm3',
          workerUserId: 'w3',
          rank: 3,
          matchingScore: 77.2,
        },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.matching.recommendations[0].rank).toBe(1);
    expect(result.matching.recommendations[1].rank).toBe(2);
    expect(result.matching.recommendations[2].rank).toBe(3);
    expect(result.matching.recommendations[0].matchingScore).toBeGreaterThan(
      result.matching.recommendations[1].matchingScore,
    );
  });

  // 10. Bid ordering and pagination remain correct
  it('Requirement 10: Bid ordering and pagination remain correct (newest first)', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 10,
      page: 2,
      limit: 2,
      items: [
        {
          id: 'bid-3',
          workerId: 'w3',
          amount: 250000,
          submittedAt: '2026-10-28T10:00:00.000Z',
        },
        {
          id: 'bid-4',
          workerId: 'w4',
          amount: 260000,
          submittedAt: '2026-10-28T09:30:00.000Z',
        },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 2, limit: 2 },
      customerUser,
    );

    expect(result.bidding.page).toBe(2);
    expect(result.bidding.limit).toBe(2);
    expect(result.bidding.total).toBe(10);
    expect(result.bidding.items[0].sourceBidId).toBe('bid-3');
    expect(result.bidding.items[1].sourceBidId).toBe('bid-4');
  });

  // 11. Unauthorized customer access is denied
  it('Requirement 11: Unauthorized customer access throws 403 Forbidden', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1', // owned by cust-uuid-1
      status: 'open_for_bidding',
    });

    await expect(
      service.aggregateCandidates(
        requestId,
        { page: 1, limit: 20 },
        otherCustomerUser, // other customer tries to access
      ),
    ).rejects.toThrow(AppException);

    // Admin CAN access
    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
    });
    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [],
    });

    const adminResult = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      adminUser,
    );
    expect(adminResult).toBeDefined();
  });

  // 12. Sealed-bid data remains protected
  it('Requirement 12: Sealed-bid data remains protected (masked bids passed through)', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'sealed-bid',
          workerId: 'w-competitor',
          amount: 0,
          message: '[Báo giá kín]',
          isMasked: true,
          submittedAt: '2026-10-28T10:00:00.000Z',
        },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.bidding.items[0].isMasked).toBe(true);
    expect(result.bidding.items[0].amount).toBe(0);
    expect(result.bidding.items[0].message).toBe('[Báo giá kín]');
  });

  // 13. Matching internal API returns 404 before results are ready
  it('Requirement 13: Matching internal API returns 404 before results are ready (handles as processing)', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 'b1', workerId: 'w1', amount: 200000, submittedAt: '2026-10-28' },
      ],
    });

    // Client maps 404 to status 'processing' without error
    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'processing',
      recommendations: [],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.matching.status).toBe('processing');
    expect(result.matching.recommendations).toHaveLength(0);
    expect(result.partial).toBe(false);
  });

  // 14. Matching Service timeout or failure
  it('Requirement 14: Matching Service timeout or failure returns valid bids with partial failure', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 1,
      page: 1,
      limit: 20,
      items: [
        { id: 'b1', workerId: 'w1', amount: 200000, submittedAt: '2026-10-28' },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'unavailable',
      recommendations: [],
      error: 'Matching service request timed out',
      statusCode: 504,
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.bidding.items).toHaveLength(1);
    expect(result.matching.status).toBe('unavailable');
    expect(result.partial).toBe(true);
    expect(result.partialFailures).toBeDefined();
    expect(result.partialFailures?.[0].service).toBe('matching');
  });

  // 15. Bidding Service timeout or failure
  it('Bidding failure suppresses recommendations that cannot be globally deduplicated', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'unavailable',
      total: 0,
      page: 1,
      limit: 20,
      items: [],
      error: 'Bidding service unavailable',
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        { matchResultId: 'm1', workerUserId: 'w1', rank: 1, matchingScore: 90 },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(result.bidding.status).toBe('unavailable');
    expect(result.bidding.items).toHaveLength(0);
    expect(result.matching.recommendations).toHaveLength(0);
    expect(result.partial).toBe(true);
    expect(result.partialFailures?.[0].service).toBe('bidding');
  });

  // 19. Source Bid/Matching IDs remain usable in Booking Proposals
  it('Requirement 19: Source Bid/Matching IDs remain usable for Booking Proposal creation', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'open_for_bidding',
    });

    mockBiddingClient.getBidsAndStatus.mockResolvedValue({
      status: 'open',
      total: 1,
      page: 1,
      limit: 20,
      items: [
        {
          id: 'bid-uuid-1234',
          workerId: 'worker-user-5678',
          amount: 350000,
          submittedAt: '2026-10-28T10:00:00.000Z',
        },
      ],
    });

    mockMatchingClient.getRecommendations.mockResolvedValue({
      status: 'completed',
      recommendations: [
        {
          matchResultId: 'match-result-uuid-9999',
          workerUserId: 'worker-user-8888',
          rank: 1,
          matchingScore: 95.0,
        },
      ],
    });

    const result = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    // Bid proposal reference check
    const bidCandidate = result.bidding.items[0];
    expect(bidCandidate.selectionSource).toBe('bid');
    expect(bidCandidate.sourceBidId).toBe('bid-uuid-1234');
    expect(bidCandidate.workerUserId).toBe('worker-user-5678');

    // Matching proposal reference check
    const matchingCandidate = result.matching.recommendations[0];
    expect(matchingCandidate.selectionSource).toBe('recommendation');
    expect(matchingCandidate.sourceMatchResultId).toBe(
      'match-result-uuid-9999',
    );
    expect(matchingCandidate.workerUserId).toBe('worker-user-8888');
  });

  // 20. Cancelled or converted requests cannot expose actionable candidates
  it('Requirement 20: Cancelled or converted requests cannot expose actionable candidates', async () => {
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'cancelled',
    });

    const cancelledResult = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(cancelledResult.requestStatus).toBe('cancelled');
    expect(cancelledResult.bidding.items).toHaveLength(0);
    expect(cancelledResult.matching.recommendations).toHaveLength(0);

    // Converted to order
    mockOrderClient.getServiceRequest.mockResolvedValue({
      id: requestId,
      customerUserId: 'cust-uuid-1',
      status: 'converted_to_order',
    });

    const convertedResult = await service.aggregateCandidates(
      requestId,
      { page: 1, limit: 20 },
      customerUser,
    );

    expect(convertedResult.requestStatus).toBe('converted_to_order');
    expect(convertedResult.bidding.items).toHaveLength(0);
    expect(convertedResult.matching.recommendations).toHaveLength(0);
  });
});
