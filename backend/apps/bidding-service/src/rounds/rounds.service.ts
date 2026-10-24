import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BiddingStatusResponseDto } from './dto/bidding-status-response.dto.js';
import { EVENT_PATTERNS } from '@app/common';
import type { BiddingRound, Prisma } from '@prisma/bidding-client';

@Injectable()
export class RoundsService {
  private readonly logger = new Logger(RoundsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the current bidding status for a service request.
   * If the round is 'open' but its deadline has passed, automatically
   * transitions to 'closed' (if active bids > 0) or 'no_bid' (if 0 active bids)
   * and persists the state change with an outbox event.
   */
  async getBiddingStatus(serviceRequestId: string): Promise<BiddingStatusResponseDto> {
    const round = await this.prisma.biddingRound.findUnique({
      where: { serviceRequestId },
    });

    if (!round) {
      throw new NotFoundException(
        `Bidding round for service request ${serviceRequestId} not found`,
      );
    }

    const now = new Date();
    let currentRound: BiddingRound = round;

    // Check on-the-fly expiration
    if (currentRound.status === 'open' && now >= currentRound.closesAt) {
      currentRound = await this.expireRoundIfNeeded(currentRound, now);
    }

    const activeBidCount = await this.prisma.bid.count({
      where: {
        biddingRoundId: currentRound.id,
        status: 'active',
      },
    });

    const timeRemainingSeconds = Math.max(
      0,
      Math.floor((currentRound.closesAt.getTime() - now.getTime()) / 1000),
    );

    return {
      roundId: currentRound.id,
      serviceRequestId: currentRound.serviceRequestId,
      status: currentRound.status,
      opensAt: currentRound.opensAt,
      closesAt: currentRound.closesAt,
      bidCount: currentRound.bidCount,
      activeBidCount,
      timeRemainingSeconds,
      isExpired: now >= currentRound.closesAt,
    };
  }

  /**
   * Transitions an open round to closed or no_bid when deadline expires.
   */
  async expireRoundIfNeeded(
    round: BiddingRound,
    now: Date = new Date(),
  ): Promise<BiddingRound> {
    const activeBidsCount = await this.prisma.bid.count({
      where: {
        biddingRoundId: round.id,
        status: 'active',
      },
    });

    const newStatus = activeBidsCount > 0 ? 'closed' : 'no_bid';

    this.logger.log(
      `Expiring bidding round ${round.id} for request ${round.serviceRequestId} -> status: ${newStatus} (active bids: ${activeBidsCount})`,
    );

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.biddingRound.update({
        where: { id: round.id },
        data: {
          status: newStatus,
          updatedAt: now,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bidding_round',
          aggregateId: round.id,
          eventType: EVENT_PATTERNS.BIDDING_ROUND_CLOSED,
          eventVersion: 1,
          payload: {
            roundId: round.id,
            serviceRequestId: round.serviceRequestId,
            status: newStatus,
            activeBidsCount,
            closedAt: now.toISOString(),
          },
        },
      });

      return updated;
    });
  }

  /**
   * Closes a round by ID if it is currently 'open' and has reached its closesAt deadline.
   */
  async expireRoundById(
    roundId: string,
    now: Date = new Date(),
  ): Promise<BiddingRound | null> {
    const round = await this.prisma.biddingRound.findUnique({
      where: { id: roundId },
    });

    if (!round) {
      this.logger.warn(`expireRoundById: round ${roundId} not found`);
      return null;
    }

    if (round.status !== 'open') {
      return round;
    }

    if (now < round.closesAt) {
      this.logger.log(
        `Round ${roundId} has not yet expired (closesAt: ${round.closesAt.toISOString()}, now: ${now.toISOString()})`,
      );
      return round;
    }

    return this.expireRoundIfNeeded(round, now);
  }

  /**
   * Scans all overdue open rounds using composite index [status, closesAt]
   */
  async findOverdueOpenRounds(
    limit = 50,
    now: Date = new Date(),
  ): Promise<BiddingRound[]> {
    return this.prisma.biddingRound.findMany({
      where: {
        status: 'open',
        closesAt: { lte: now },
      },
      orderBy: { closesAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Opens a bidding round when service_request.published is received.
   */
  async openRound(params: {
    serviceRequestId: string;
    opensAt?: Date;
    closesAt?: Date;
    durationHours?: number;
  }): Promise<BiddingRound> {
    const opensAt = params.opensAt || new Date();
    const durationHours = params.durationHours || 24;
    const closesAt =
      params.closesAt ||
      new Date(opensAt.getTime() + durationHours * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.biddingRound.findUnique({
        where: { serviceRequestId: params.serviceRequestId },
      });

      let round: BiddingRound;
      if (existing) {
        round = await tx.biddingRound.update({
          where: { id: existing.id },
          data: {
            status: 'open',
            opensAt,
            closesAt,
          },
        });
      } else {
        round = await tx.biddingRound.create({
          data: {
            serviceRequestId: params.serviceRequestId,
            status: 'open',
            opensAt,
            closesAt,
            bidCount: 0,
          },
        });
      }

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bidding_round',
          aggregateId: round.id,
          eventType: EVENT_PATTERNS.BIDDING_ROUND_OPENED,
          eventVersion: 1,
          payload: {
            roundId: round.id,
            serviceRequestId: round.serviceRequestId,
            status: 'open',
            opensAt: round.opensAt.toISOString(),
            closesAt: round.closesAt.toISOString(),
          },
        },
      });

      return round;
    });
  }

  /**
   * Cancels a round when service_request.cancelled is received.
   * Also rejects all still active bids.
   */
  async cancelRound(serviceRequestId: string): Promise<BiddingRound | null> {
    const existing = await this.prisma.biddingRound.findUnique({
      where: { serviceRequestId },
    });

    if (!existing) {
      this.logger.warn(`Cannot cancel round for request ${serviceRequestId}: round not found`);
      return null;
    }

    if (existing.status === 'cancelled' || existing.status === 'finalized') {
      return existing;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.biddingRound.update({
        where: { id: existing.id },
        data: { status: 'cancelled' },
      });

      // Reject all active bids
      await tx.bid.updateMany({
        where: {
          biddingRoundId: existing.id,
          status: 'active',
        },
        data: {
          status: 'rejected',
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bidding_round',
          aggregateId: existing.id,
          eventType: 'bidding.round.cancelled',
          eventVersion: 1,
          payload: {
            roundId: existing.id,
            serviceRequestId,
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
          },
        },
      });

      return updated;
    });
  }

  /**
   * Finalizes a round on order.created event.
   * Marks chosen bid (if any) as 'selected' and all other active bids as 'rejected'.
   */
  async finalizeRound(params: {
    serviceRequestId: string;
    orderId: string;
    selectedBidId?: string;
    winningWorkerId?: string;
  }): Promise<BiddingRound | null> {
    const round = await this.prisma.biddingRound.findUnique({
      where: { serviceRequestId: params.serviceRequestId },
    });

    if (!round) {
      this.logger.warn(
        `Cannot finalize round for request ${params.serviceRequestId}: round not found`,
      );
      return null;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedRound = await tx.biddingRound.update({
        where: { id: round.id },
        data: { status: 'finalized' },
      });

      if (params.selectedBidId) {
        // Mark the selected bid
        await tx.bid.update({
          where: { id: params.selectedBidId },
          data: { status: 'selected' },
        });

        // Mark all other active bids as rejected
        await tx.bid.updateMany({
          where: {
            biddingRoundId: round.id,
            id: { not: params.selectedBidId },
            status: 'active',
          },
          data: { status: 'rejected' },
        });
      } else {
        // If worker won via Recommendation without submitting bid,
        // reject all still active bids
        await tx.bid.updateMany({
          where: {
            biddingRoundId: round.id,
            status: 'active',
          },
          data: { status: 'rejected' },
        });
      }

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bidding_round',
          aggregateId: round.id,
          eventType: EVENT_PATTERNS.BIDDING_ROUND_FINALIZED,
          eventVersion: 1,
          payload: {
            roundId: round.id,
            serviceRequestId: params.serviceRequestId,
            orderId: params.orderId,
            selectedBidId: params.selectedBidId ?? null,
            winningWorkerId: params.winningWorkerId ?? null,
            finalizedAt: new Date().toISOString(),
          },
        },
      });

      return updatedRound;
    });
  }
}
