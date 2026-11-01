import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { OrderClient, type UserContext } from './clients/order.client.js';
import { BiddingClient } from './clients/bidding.client.js';
import { MatchingClient } from './clients/matching.client.js';
import type { QueryCandidatesDto } from './dto/query-candidates.dto.js';
import type {
  BidCandidateDto,
  CandidatesDataDto,
  MatchingRecommendationDto,
  PartialFailureDetailDto,
} from './dto/candidates-response.dto.js';

@Injectable()
export class CandidatesAggregationService {
  private readonly logger = new Logger(CandidatesAggregationService.name);

  constructor(
    private readonly orderClient: OrderClient,
    private readonly biddingClient: BiddingClient,
    private readonly matchingClient: MatchingClient,
  ) {}

  async aggregateCandidates(
    requestId: string,
    query: QueryCandidatesDto,
    user: UserContext,
    correlationId?: string,
  ): Promise<CandidatesDataDto> {
    // 1. Authoritative check: Service Request existence and ownership from Order Service
    const serviceRequest = await this.orderClient.getServiceRequest(
      requestId,
      user,
      correlationId,
    );

    const isOwner = serviceRequest.customerUserId === user.userId;
    const isAdmin = user.roles?.some((r) => r.toLowerCase() === 'admin');

    if (!isOwner && !isAdmin) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        'Bạn không có quyền truy cập ứng viên của yêu cầu dịch vụ này',
      );
    }

    // 2. Lifecycle check: Cancelled or converted requests cannot expose actionable candidates
    if (
      serviceRequest.status === 'expired' ||
      serviceRequest.status === 'cancelled' ||
      serviceRequest.status === 'converted_to_order'
    ) {
      return {
        requestId,
        requestStatus: serviceRequest.status,
        bidding: {
          status:
            serviceRequest.status === 'cancelled' ? 'cancelled' : 'closed',
          closesAt: null,
          total: 0,
          page: query.page,
          limit: query.limit,
          items: [],
        },
        matching: {
          status: serviceRequest.status,
          displayLimit: 5,
          recommendations: [],
        },
        partial: false,
      };
    }

    // 3. Concurrent execution of Bidding & Matching queries
    const [biddingResult, matchingResult] = await Promise.all([
      this.biddingClient.getBidsAndStatus(
        requestId,
        query,
        user,
        correlationId,
      ),
      this.matchingClient.getRecommendations(requestId, correlationId),
    ]);

    // 4. Track partial failures
    const partialFailures: PartialFailureDetailDto[] = [];
    if (biddingResult.error) {
      partialFailures.push({
        service: 'bidding',
        reason: biddingResult.error,
        statusCode: biddingResult.statusCode,
      });
    }
    if (matchingResult.error) {
      partialFailures.push({
        service: 'matching',
        reason: matchingResult.error,
        statusCode: matchingResult.statusCode,
      });
    }
    const missingBidderIndex =
      biddingResult.total > biddingResult.items.length &&
      !Array.isArray(biddingResult.allBidderWorkerIds);
    if (missingBidderIndex)
      partialFailures.push({
        service: 'bidding',
        reason: 'Request-wide bidder index unavailable',
      });
    const isPartial = partialFailures.length > 0;

    // 5. Map Bidding Candidates (preserve Bid ordering and sealed-bid protections)
    const biddingItems: BidCandidateDto[] = biddingResult.items.map((b) => {
      const bidId = b.id;
      const workerId = b.workerId || b.workerUserId;
      return {
        selectionSource: 'bid' as const,
        sourceBidId: bidId,
        workerUserId: workerId,
        id: bidId,
        biddingRoundId: b.biddingRoundId,
        serviceRequestId: b.serviceRequestId || requestId,
        workerId,
        amount: typeof b.amount === 'number' ? b.amount : Number(b.amount || 0),
        message: b.message ?? null,
        validUntil: b.validUntil ? new Date(b.validUntil).toISOString() : null,
        status: b.status,
        version: b.version,
        submittedAt: b.submittedAt
          ? new Date(b.submittedAt).toISOString()
          : new Date().toISOString(),
        revisionsCount: b.revisionsCount,
        isMasked: Boolean(b.isMasked),
        workerProfile: b.workerProfile || null,
      };
    });

    // 6. Deduplication & Top 5 Replenishment for Matching Recommendations
    // Rule: When the same Worker appears in both Bidding and Matching:
    // - Keep the Worker in Bidding
    // - Exclude that Worker from Matching recommendations
    // - Continue down the Top 20 results to replenish up to 5 recommendations
    // - Preserve relative AI rank order
    // Global deduplication across all bidding pages (PR34-07):
    // Use allBidderWorkerIds from Bidding Service if available, otherwise fall back to current page items
    const allBiddersList =
      Array.isArray(biddingResult.allBidderWorkerIds) &&
      biddingResult.allBidderWorkerIds.length > 0
        ? biddingResult.allBidderWorkerIds
        : biddingItems.map((b) => b.workerUserId).filter(Boolean);

    const biddingWorkerIds = new Set<string>(allBiddersList);

    const matchingRecommendations: MatchingRecommendationDto[] = [];
    const seenMatchingWorkers = new Set<string>();

    const canDeduplicate =
      !missingBidderIndex &&
      (Array.isArray(biddingResult.allBidderWorkerIds) || !biddingResult.error);
    for (const rec of canDeduplicate ? matchingResult.recommendations : []) {
      if (matchingRecommendations.length >= 5) {
        break;
      }
      const workerId = rec.workerUserId;
      if (!workerId) {
        continue;
      }

      // Exclude if worker already submitted a bid
      if (biddingWorkerIds.has(workerId)) {
        continue;
      }

      // Ensure uniqueness
      if (seenMatchingWorkers.has(workerId)) {
        continue;
      }

      seenMatchingWorkers.add(workerId);
      matchingRecommendations.push({
        selectionSource: 'recommendation' as const,
        sourceMatchResultId: rec.matchResultId,
        workerUserId: workerId,
        rank: rec.rank,
        matchingScore: Number(rec.matchingScore),
        scoreBreakdown: rec.scoreBreakdown,
        workerProfile: null,
      });
    }

    return {
      requestId,
      requestStatus: serviceRequest.status,
      bidding: {
        status: biddingResult.status,
        closesAt: biddingResult.closesAt || null,
        total: biddingResult.total,
        page: query.page,
        limit: query.limit,
        items: biddingItems,
      },
      matching: {
        status: matchingResult.status,
        displayLimit: 5,
        recommendations: matchingRecommendations,
        modelVersion: matchingResult.modelVersion,
        generatedAt: matchingResult.generatedAt,
      },
      partial: isPartial,
      ...(isPartial ? { partialFailures } : {}),
    };
  }
}
