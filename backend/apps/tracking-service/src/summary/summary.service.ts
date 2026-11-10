import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { TrackingEntityType } from '@prisma/tracking-client';
import { RedisService } from '@app/redis';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';
import type {
  TrackingSummaryResponseDto,
  ServiceRequestMilestoneDto,
  MatchingMilestoneDto,
  BiddingMilestoneDto,
  ProposalMilestoneDto,
  OrderMilestoneDto,
  PaymentMilestoneDto,
} from './dto/summary-response.dto.js';

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private static readonly IMMUTABLE_TTL_SECONDS = 7 * 24 * 3600; // 7 ngày

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Generates a high-level summary of the entire Service Request flow for UI display.
   * Enforces data minimization and privacy (TRK-04).
   * Caches completed / cancelled flows in Redis for fast retrieval.
   */
  async getRequestSummary(
    serviceRequestId: string,
    user: GatewayUser,
  ): Promise<TrackingSummaryResponseDto> {
    const flow = await this.prisma.trackingFlow.findUnique({
      where: { serviceRequestId },
      include: {
        events: {
          orderBy: [
            { occurredAt: 'asc' },
            { recordedAt: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    });

    if (!flow) {
      throw new NotFoundException(
        `Không tìm thấy tiến trình theo dõi cho yêu cầu: ${serviceRequestId}`,
      );
    }

    // Role-based authorization: fail-closed if ownership or participation cannot be confirmed
    if (!user.isAdmin) {
      const isOwner =
        user.isCustomer && flow.customerId && flow.customerId === user.userId;

      let isParticipatingWorker = false;
      if (user.isWorker) {
        isParticipatingWorker = flow.events.some(
          (e) =>
            e.actorUserId === user.userId ||
            (e.metadata as any)?.workerId === user.userId ||
            (e.metadata as any)?.workerUserId === user.userId,
        );
      }

      if (!isOwner && !isParticipatingWorker) {
        throw new ForbiddenException(
          'Bạn không có quyền xem thông tin tổng hợp của yêu cầu này',
        );
      }
    }

    const cacheKey = this.buildSummaryCacheKey(
      serviceRequestId,
      user,
      flow.eventSequence ?? 0,
    );
    if (this.redis) {
      const cached = await this.redis.get<TrackingSummaryResponseDto>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for summary: ${cacheKey}`);
        return cached;
      }
    }

    const events = flow.events;

    // 1. Service Request Milestone
    const reqMilestone: ServiceRequestMilestoneDto = {
      status: 'draft',
      createdAt: flow.createdAt,
    };

    for (const evt of events) {
      if (evt.eventType === 'service_request.created') {
        reqMilestone.createdAt = evt.occurredAt;
      } else if (evt.eventType === 'service_request.published') {
        reqMilestone.publishedAt = evt.occurredAt;
        reqMilestone.status = 'open_for_bidding';
      } else if (evt.eventType === 'service_request.bidding_closed') {
        const closedAt = (evt.metadata as Record<string, unknown> | null)
          ?.biddingClosedAt;
        const parsedClosedAt =
          typeof closedAt === 'string' ? new Date(closedAt) : null;
        reqMilestone.biddingClosedAt =
          parsedClosedAt && !Number.isNaN(parsedClosedAt.getTime())
            ? parsedClosedAt
            : evt.occurredAt;
        reqMilestone.status = 'bidding_closed';
      } else if (evt.eventType === 'service_request.cancelled') {
        reqMilestone.cancelledAt = evt.occurredAt;
        reqMilestone.status = 'cancelled';
      } else if (evt.eventType === 'service_request.expired') {
        reqMilestone.expiredAt = evt.occurredAt;
        reqMilestone.status = 'expired';
      } else if (evt.eventType === 'service_request.converted_to_order') {
        reqMilestone.convertedAt = evt.occurredAt;
        reqMilestone.status = 'converted_to_order';
      }
    }

    // 2. Matching Milestone
    const matchMilestone: MatchingMilestoneDto = {
      status: 'idle',
    };

    for (const evt of events) {
      if (evt.eventType === 'matching.started') {
        matchMilestone.status = 'started';
      } else if (evt.eventType === 'matching.completed') {
        matchMilestone.status = 'completed';
        matchMilestone.completedAt = evt.occurredAt;
        const meta = evt.metadata as any;
        if (typeof meta?.matchCount === 'number') {
          matchMilestone.matchCount = meta.matchCount;
        }
      } else if (evt.eventType === 'matching.failed') {
        matchMilestone.status = 'failed';
        matchMilestone.completedAt = evt.occurredAt;
      }
    }

    // 3. Bidding Milestone
    const bidMilestone: BiddingMilestoneDto = {
      status: 'idle',
      bidCount: 0,
    };

    const submittedBidIds = new Set<string>();

    for (const evt of events) {
      if (evt.eventType === 'bidding.round.opened') {
        bidMilestone.status = 'open';
        bidMilestone.openedAt = evt.occurredAt;
      } else if (evt.eventType === 'bidding.round.closed') {
        bidMilestone.status = 'closed';
        bidMilestone.closedAt = evt.occurredAt;
      } else if (evt.eventType === 'bidding.round.finalized') {
        bidMilestone.status = 'finalized';
        bidMilestone.finalizedAt = evt.occurredAt;
      } else if (evt.eventType === 'bid.submitted') {
        submittedBidIds.add(evt.entityId);
      }
    }
    bidMilestone.bidCount = submittedBidIds.size;

    // If requester is a Worker, populate their own bid details without leaking competitor amounts
    if (user.isWorker && !user.isAdmin) {
      const myBidEvent = [...events]
        .reverse()
        .find(
          (e) =>
            e.entityType === TrackingEntityType.bid &&
            (e.actorUserId === user.userId ||
              (e.metadata as any)?.workerId === user.userId),
        );

      if (myBidEvent) {
        const meta = myBidEvent.metadata as any;
        bidMilestone.myBid = {
          bidId: myBidEvent.entityId,
          amount: meta?.amount,
          status: myBidEvent.toStatus || 'active',
        };
      }
    }

    // 4. Booking Proposal Milestone
    let proposalMilestone: ProposalMilestoneDto | undefined;
    const latestProposalEvent = [...events]
      .reverse()
      .find((e) => e.entityType === TrackingEntityType.booking_proposal);

    if (latestProposalEvent) {
      const meta = latestProposalEvent.metadata as any;
      const proposalWorkerId =
        meta?.workerId || latestProposalEvent.actorUserId;

      // Privacy: If user is Worker, only expose proposal details if they are the designated worker
      const isAuthorizedForProposal =
        user.isAdmin ||
        user.isCustomer ||
        (user.isWorker && proposalWorkerId === user.userId);

      if (isAuthorizedForProposal) {
        proposalMilestone = {
          status:
            latestProposalEvent.eventType === 'booking_proposal.finalized'
              ? 'finalized'
              : latestProposalEvent.eventType === 'booking_proposal.rejected'
                ? 'rejected'
                : latestProposalEvent.eventType ===
                    'booking_proposal.changes_requested'
                  ? 'changes_requested'
                  : latestProposalEvent.eventType ===
                      'booking_proposal.withdrawn'
                    ? 'withdrawn'
                    : 'proposed',
          proposalId: latestProposalEvent.entityId,
          revisionNo: meta?.revisionNo,
          workerId: proposalWorkerId,
          finalizedAt:
            latestProposalEvent.eventType === 'booking_proposal.finalized'
              ? latestProposalEvent.occurredAt
              : undefined,
        };
      }
    }

    // 5. Order Milestone
    let orderMilestone: OrderMilestoneDto | undefined;
    const orderCreatedEvent = events.find(
      (e) => e.eventType === 'order.created',
    );
    const latestOrderEvent = [...events]
      .reverse()
      .find((e) => e.entityType === TrackingEntityType.order);

    // Privacy: Identify assigned worker for the order to avoid leaking to other participating workers
    const orderCreatedMeta = orderCreatedEvent?.metadata as any;
    const anyOrderMeta = latestOrderEvent?.metadata as any;
    const assignedWorkerId =
      orderCreatedMeta?.workerUserId ||
      orderCreatedMeta?.workerId ||
      orderCreatedEvent?.actorUserId ||
      anyOrderMeta?.workerUserId ||
      anyOrderMeta?.workerId ||
      latestOrderEvent?.actorUserId;

    const isAssignedWorker = Boolean(
      assignedWorkerId && assignedWorkerId === user.userId,
    );
    const isAuthorizedForOrderAndPayment =
      user.isAdmin || user.isCustomer || (user.isWorker && isAssignedWorker);

    if ((orderCreatedEvent || flow.orderId) && isAuthorizedForOrderAndPayment) {
      const orderCancelled = [...events]
        .reverse()
        .find((e) => e.eventType === 'order.cancelled');
      const orderCompleted = [...events]
        .reverse()
        .find((e) => e.eventType === 'order.completed');

      let orderStatus = 'created';
      if (latestOrderEvent) {
        const meta = latestOrderEvent.metadata as any;
        const targetStatus =
          latestOrderEvent.toStatus ||
          meta?.nextStatus ||
          meta?.toStatus ||
          meta?.newStatus ||
          meta?.status;

        if (latestOrderEvent.eventType === 'order.cancelled') {
          orderStatus = 'cancelled';
        } else if (latestOrderEvent.eventType === 'order.completed') {
          orderStatus = 'completed';
        } else if (
          latestOrderEvent.eventType === 'order.disputed' ||
          targetStatus === 'disputed'
        ) {
          orderStatus = 'disputed';
        } else if (
          latestOrderEvent.eventType === 'order.rework_requested' ||
          meta?.notificationKind === 'rework_requested' ||
          (targetStatus === 'in_progress' &&
            (latestOrderEvent.fromStatus === 'finished' ||
              latestOrderEvent.fromStatus ===
                'awaiting_customer_confirmation' ||
              meta?.previousStatus === 'finished' ||
              meta?.previousStatus === 'awaiting_customer_confirmation'))
        ) {
          orderStatus = 'in_progress';
        } else if (targetStatus) {
          orderStatus = targetStatus;
        } else if (latestOrderEvent.eventType === 'order.started') {
          orderStatus = 'in_progress';
        } else if (latestOrderEvent.eventType === 'order.accepted') {
          orderStatus = 'confirmed';
        } else {
          orderStatus = latestOrderEvent.eventType.replace('order.', '');
        }
      }

      const latestRework = [...events]
        .reverse()
        .find(
          (e) =>
            e.eventType === 'order.rework_requested' ||
            (e.metadata as any)?.notificationKind === 'rework_requested' ||
            Boolean((e.metadata as any)?.reworkReason) ||
            ((e.toStatus === 'in_progress' ||
              (e.metadata as any)?.nextStatus === 'in_progress') &&
              (e.fromStatus === 'finished' ||
                e.fromStatus === 'awaiting_customer_confirmation' ||
                (e.metadata as any)?.previousStatus === 'finished' ||
                (e.metadata as any)?.previousStatus ===
                  'awaiting_customer_confirmation') &&
              Boolean(e.reason)),
        );

      const latestDispute = [...events]
        .reverse()
        .find(
          (e) =>
            e.eventType === 'order.disputed' ||
            e.toStatus === 'disputed' ||
            (e.metadata as any)?.nextStatus === 'disputed' ||
            Boolean((e.metadata as any)?.disputeReason),
        );

      const reworkReason =
        latestRework?.reason ||
        (latestRework?.metadata as any)?.reworkReason ||
        (latestRework?.metadata as any)?.reason;

      const disputeReason =
        latestDispute?.reason ||
        (latestDispute?.metadata as any)?.disputeReason ||
        (latestDispute?.metadata as any)?.reason;

      orderMilestone = {
        orderId: flow.orderId || orderCreatedEvent?.entityId,
        status: orderStatus,
        createdAt: orderCreatedEvent?.occurredAt || flow.updatedAt,
        completedAt: orderCompleted?.occurredAt,
        cancelledAt: orderCancelled?.occurredAt,
        ...(reworkReason ? { reworkReason } : {}),
        ...(disputeReason ? { disputeReason } : {}),
      };
    }

    // 6. Payment Milestone
    let paymentMilestone: PaymentMilestoneDto | undefined;
    const latestPaymentEvent = [...events]
      .reverse()
      .find((e) => e.entityType === TrackingEntityType.payment);

    if (latestPaymentEvent && isAuthorizedForOrderAndPayment) {
      paymentMilestone = {
        status: latestPaymentEvent.eventType.replace('payment.', ''),
        lastEventAt: latestPaymentEvent.occurredAt,
      };
    }

    // 7. Calculate Current Phase
    const currentPhase = this.computeCurrentPhase(
      reqMilestone,
      bidMilestone,
      proposalMilestone,
      orderMilestone,
      paymentMilestone,
    );

    const lastEvent = events[events.length - 1];
    const lastActivityAt = lastEvent ? lastEvent.occurredAt : flow.updatedAt;

    const result: TrackingSummaryResponseDto = {
      flowId: flow.id,
      serviceRequestId: flow.serviceRequestId,
      orderId: flow.orderId,
      customerId: flow.customerId,
      currentPhase,
      serviceRequest: reqMilestone,
      matching: matchMilestone,
      bidding: bidMilestone,
      bookingProposal: proposalMilestone,
      order: orderMilestone,
      payment: paymentMilestone,
      totalEvents: events.length,
      lastActivityAt,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    };

    const isImmutable = ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(
      currentPhase,
    );
    if (isImmutable && this.redis) {
      await this.redis.set(
        cacheKey,
        result,
        SummaryService.IMMUTABLE_TTL_SECONDS,
      );
      this.logger.debug(
        `Cached immutable summary for ${cacheKey} (TTL: ${SummaryService.IMMUTABLE_TTL_SECONDS}s)`,
      );
    }

    return result;
  }

  private buildSummaryCacheKey(
    serviceRequestId: string,
    user: GatewayUser,
    version: number,
  ): string {
    let userScope = 'admin';
    if (user.isCustomer) {
      userScope = `cust:${user.userId}`;
    } else if (user.isWorker) {
      userScope = `wrk:${user.userId}`;
    }
    return `tracking:summary:${serviceRequestId}:${userScope}:v${version}`;
  }

  private computeCurrentPhase(
    req: ServiceRequestMilestoneDto,
    bidding: BiddingMilestoneDto,
    proposal?: ProposalMilestoneDto,
    order?: OrderMilestoneDto,
    payment?: PaymentMilestoneDto,
  ): string {
    if (order?.status === 'cancelled' || req.status === 'cancelled') {
      return 'CANCELLED';
    }
    if (req.status === 'expired') {
      return 'EXPIRED';
    }
    if (order?.status === 'disputed') {
      return 'DISPUTED';
    }
    if (
      order?.status === 'completed' &&
      (payment?.status === 'succeeded' ||
        payment?.status === 'completed' ||
        payment?.status === 'paid')
    ) {
      return 'COMPLETED';
    }
    if (order?.status === 'completed') {
      return 'COMPLETED';
    }
    if (order?.status === 'awaiting_customer_confirmation') {
      return 'AWAITING_CONFIRMATION';
    }
    if (order?.status === 'in_progress') {
      return 'ORDER_IN_PROGRESS';
    }
    if (order?.status === 'confirmed') {
      return 'ORDER_CONFIRMED';
    }
    if (order?.orderId) {
      return 'ORDER_CREATED';
    }
    if (
      proposal?.status === 'finalized' ||
      req.status === 'converted_to_order'
    ) {
      return 'CONVERTED_TO_ORDER';
    }
    if (
      proposal?.status === 'proposed' ||
      proposal?.status === 'changes_requested'
    ) {
      return 'PROPOSAL_NEGOTIATION';
    }
    if (bidding.status === 'finalized') {
      return 'BIDDING_FINALIZED';
    }
    if (req.status === 'bidding_closed') {
      return 'BIDDING_CLOSED';
    }
    if (bidding.status === 'closed') {
      return 'BIDDING_CLOSED';
    }
    if (req.status === 'open_for_bidding' || bidding.status === 'open') {
      return 'OPEN_FOR_BIDDING';
    }
    return 'DRAFT';
  }
}
