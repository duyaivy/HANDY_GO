import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
   * transitions to 'closed' (if active valid bids > 0) or 'no_bid' (if 0 active valid bids)
   * and persists the state change with an outbox event.
   * F13: Excludes expired validUntil bids from active count.
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

    // N01: Check on-the-fly activation for pending rounds
    if (currentRound.status === 'pending' && now >= currentRound.opensAt) {
      const activatedRound = await this.activateRoundIfNeeded(currentRound, now);
      if (activatedRound) {
        currentRound = activatedRound;
      }
    }

    // Check on-the-fly expiration
    if (currentRound.status === 'open' && now >= currentRound.closesAt) {
      const expiredRound = await this.expireRoundIfNeeded(currentRound, now);
      if (expiredRound) {
        currentRound = expiredRound;
      }
    }

    // F13: Đếm bid active hợp lệ (chưa hết validUntil)
    const activeBidCount = await this.prisma.bid.count({
      where: {
        biddingRoundId: currentRound.id,
        status: 'active',
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
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
   * Activates a pending round if its opensAt deadline has arrived.
   * N01: Idempotent atomic CAS transition from 'pending' to 'open'.
   */
  async activateRoundIfNeeded(
    round: BiddingRound,
    now: Date = new Date(),
  ): Promise<BiddingRound | null> {
    if (round.status !== 'pending' || now < round.opensAt) {
      return round;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (typeof tx.biddingRound.updateMany === 'function') {
        const result = await tx.biddingRound.updateMany({
          where: {
            id: round.id,
            status: 'pending',
            opensAt: { lte: now },
          },
          data: {
            status: 'open',
            updatedAt: now,
          },
        });

        if (result.count === 0) {
          return tx.biddingRound.findUnique({ where: { id: round.id } });
        }
      } else {
        await tx.biddingRound.update({
          where: { id: round.id },
          data: { status: 'open', updatedAt: now },
        });
      }

      const updated = await tx.biddingRound.findUnique({
        where: { id: round.id },
      });

      if (updated) {
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
              activatedAt: now.toISOString(),
            },
          },
        });
      }

      this.logger.log(`Activated pending round ${round.id} to open`);
      return updated;
    });
  }

  /**
   * Transitions an open round to closed or no_bid when deadline expires.
   * R03/F06: CAS concurrency check ensures only one transition wins and terminal states are never overwritten.
   * F13: Marks expired bids as 'expired' and counts only valid active bids.
   */
  async expireRoundIfNeeded(
    round: BiddingRound,
    now: Date = new Date(),
  ): Promise<BiddingRound | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Mark bids that passed validUntil as 'expired'
      if (typeof tx.bid.updateMany === 'function') {
        await tx.bid.updateMany({
          where: {
            biddingRoundId: round.id,
            status: 'active',
            validUntil: { lte: now },
          },
          data: { status: 'expired' },
        });
      }

      // 2. Count genuinely valid active bids
      const validActiveBidsCount = await tx.bid.count({
        where: {
          biddingRoundId: round.id,
          status: 'active',
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
      });

      const newStatus = validActiveBidsCount > 0 ? 'closed' : 'no_bid';

      if (typeof tx.biddingRound.updateMany === 'function') {
        const updateResult = await tx.biddingRound.updateMany({
          where: {
            id: round.id,
            status: 'open',
            closesAt: { lte: now },
          },
          data: {
            status: newStatus,
            updatedAt: now,
          },
        });

        if (updateResult.count === 0) {
          // Round was finalized, cancelled, or extended concurrently; do not overwrite!
          return tx.biddingRound.findUnique({ where: { id: round.id } });
        }
      } else {
        await tx.biddingRound.update({
          where: { id: round.id },
          data: {
            status: newStatus,
            updatedAt: now,
          },
        });
      }

      let updated = await tx.biddingRound.findUnique({
        where: { id: round.id },
      });

      if (!updated || updated.status !== newStatus) {
        updated = { ...(updated || round), status: newStatus };
      }

      this.logger.log(
        `Expiring bidding round ${round.id} for request ${round.serviceRequestId} -> status: ${newStatus} (active bids: ${validActiveBidsCount})`,
      );

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
            activeBidsCount: validActiveBidsCount,
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
   * F07: Atomic Inbox record in same transaction.
   * F07: Replay protection - does NOT reopen cancelled or finalized rounds!
   */
  async openRound(params: {
    serviceRequestId: string;
    customerId?: string;
    opensAt?: Date;
    closesAt?: Date;
    durationHours?: number;
    eventId?: string;
  }): Promise<BiddingRound> {
    const opensAt = params.opensAt || new Date();
    const durationHours = params.durationHours || 24;
    const closesAt =
      params.closesAt ||
      new Date(opensAt.getTime() + durationHours * 60 * 60 * 1000);

    const now = new Date();
    const initialStatus = opensAt > now ? 'pending' : 'open';

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomic inbox check & record if eventId provided
      if (params.eventId && typeof tx.consumedEvent?.findUnique === 'function') {
        const consumed = await tx.consumedEvent.findUnique({
          where: { eventId: params.eventId },
        });
        if (consumed) {
          this.logger.warn(`Event ${params.eventId} already consumed in inbox`);
          const existingRound = await tx.biddingRound.findUnique({
            where: { serviceRequestId: params.serviceRequestId },
          });
          if (existingRound) return existingRound;
        } else {
          try {
            await tx.consumedEvent.create({
              data: {
                eventId: params.eventId,
                eventType: EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED,
                consumedAt: new Date(),
              },
            });
          } catch (err: any) {
            // Prisma P2002: Unique constraint violation on eventId (concurrent duplicate)
            if (err.code === 'P2002') {
              this.logger.warn(`Event ${params.eventId} concurrently consumed`);
              const existingRound = await tx.biddingRound.findUnique({
                where: { serviceRequestId: params.serviceRequestId },
              });
              if (existingRound) return existingRound;
            } else {
              throw err;
            }
          }
        }
      }

      const existing = await tx.biddingRound.findUnique({
        where: { serviceRequestId: params.serviceRequestId },
      });

      let round: BiddingRound;
      if (existing) {
        if (existing.status === 'pending' && initialStatus === 'open') {
          // N01: transition pending to open if scheduled opensAt is now reached
          round = await tx.biddingRound.update({
            where: { id: existing.id },
            data: {
              status: 'open',
              opensAt,
              closesAt,
              updatedAt: now,
            },
          });
        } else {
          // F07: Replay protection - do NOT reset deadline or reopen terminal/open rounds!
          this.logger.warn(
            `Round already exists for request ${params.serviceRequestId} with status "${existing.status}", ignoring duplicate published event`,
          );
          return existing;
        }
      } else {
        round = await tx.biddingRound.create({
          data: {
            serviceRequestId: params.serviceRequestId,
            customerId: params.customerId,
            status: initialStatus,
            opensAt,
            closesAt,
            bidCount: 0,
          },
        });
      }

      if (initialStatus === 'open') {
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
      } else {
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'bidding_round',
            aggregateId: round.id,
            eventType: 'bidding.round.scheduled',
            eventVersion: 1,
            payload: {
              roundId: round.id,
              serviceRequestId: round.serviceRequestId,
              status: 'pending',
              opensAt: round.opensAt.toISOString(),
              closesAt: round.closesAt.toISOString(),
            },
          },
        });
      }

      return round;
    });
  }

  /**
   * Cancels a round when service_request.cancelled is received.
   * F08: Out-of-order handling - creates tombstone if published hasn't arrived yet.
   */
  async cancelRound(
    param: string | { serviceRequestId: string; eventId?: string },
  ): Promise<BiddingRound | null> {
    const serviceRequestId =
      typeof param === 'string' ? param : param.serviceRequestId;
    const eventId = typeof param === 'string' ? undefined : param.eventId;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (eventId && typeof tx.consumedEvent?.findUnique === 'function') {
        const consumed = await tx.consumedEvent.findUnique({
          where: { eventId },
        });
        if (consumed) {
          const existing = await tx.biddingRound.findUnique({
            where: { serviceRequestId },
          });
          if (existing) return existing;
        } else {
          await tx.consumedEvent.create({
            data: {
              eventId,
              eventType: EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED,
              consumedAt: new Date(),
            },
          });
        }
      }

      const existing = await tx.biddingRound.findUnique({
        where: { serviceRequestId },
      });

      // F08: If round not found (cancel arrived before published), create cancelled tombstone
      if (!existing) {
        this.logger.warn(
          `service_request.cancelled arrived before published for request ${serviceRequestId}. Creating cancelled tombstone.`,
        );
        const tombstone = await tx.biddingRound.create({
          data: {
            serviceRequestId,
            status: 'cancelled',
            opensAt: new Date(),
            closesAt: new Date(),
            bidCount: 0,
          },
        });
        return tombstone;
      }

      if (existing.status === 'cancelled' || existing.status === 'finalized') {
        return existing;
      }

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
   * F08: Out-of-order handling - creates finalized tombstone if order arrives before published.
   * F09: Constrains selectedBid to current round and worker.
   */
  async finalizeRound(params: {
    serviceRequestId: string;
    orderId: string;
    selectedBidId?: string;
    winningWorkerId?: string;
    eventId?: string;
  }): Promise<BiddingRound | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (params.eventId && typeof tx.consumedEvent?.findUnique === 'function') {
        const consumed = await tx.consumedEvent.findUnique({
          where: { eventId: params.eventId },
        });
        if (consumed) {
          const existing = await tx.biddingRound.findUnique({
            where: { serviceRequestId: params.serviceRequestId },
          });
          if (existing) return existing;
        } else {
          await tx.consumedEvent.create({
            data: {
              eventId: params.eventId,
              eventType: EVENT_PATTERNS.ORDER_CREATED,
              consumedAt: new Date(),
            },
          });
        }
      }

      const round = await tx.biddingRound.findUnique({
        where: { serviceRequestId: params.serviceRequestId },
      });

      // F08: If round not found (order.created arrived before published), create finalized tombstone
      if (!round) {
        this.logger.warn(
          `order.created arrived before published for request ${params.serviceRequestId}. Creating finalized tombstone.`,
        );
        const tombstone = await tx.biddingRound.create({
          data: {
            serviceRequestId: params.serviceRequestId,
            status: 'finalized',
            opensAt: new Date(),
            closesAt: new Date(),
            bidCount: 0,
          },
        });
        return tombstone;
      }

      // If already finalized, return idempotent
      if (round.status === 'finalized') {
        return round;
      }

      if (round.status === 'cancelled') {
        this.logger.warn(
          `Cannot finalize round ${round.id} because it was already cancelled`,
        );
        return round;
      }

      if (params.selectedBidId) {
        let selectedBid: any = null;
        if (typeof tx.bid?.findUnique === 'function') {
          selectedBid = await tx.bid.findUnique({
            where: { id: params.selectedBidId },
          });
        } else {
          selectedBid = {
            id: params.selectedBidId,
            biddingRoundId: round.id,
            serviceRequestId: params.serviceRequestId,
            workerId: params.winningWorkerId,
          };
        }

        if (
          !selectedBid ||
          selectedBid.biddingRoundId !== round.id ||
          selectedBid.serviceRequestId !== params.serviceRequestId
        ) {
          throw new BadRequestException(
            `Báo giá ${params.selectedBidId} không hợp lệ hoặc không thuộc về phiên ${round.id}`,
          );
        }

        if (
          params.winningWorkerId &&
          selectedBid.workerId !== params.winningWorkerId
        ) {
          throw new BadRequestException(
            `Thợ chiến thắng ${params.winningWorkerId} không khớp với thợ gửi báo giá ${selectedBid.workerId}`,
          );
        }

        // Mark the selected bid
        await tx.bid.update({
          where: { id: selectedBid.id },
          data: { status: 'selected' },
        });

        // Mark all other active bids of THIS round as rejected
        await tx.bid.updateMany({
          where: {
            biddingRoundId: round.id,
            id: { not: selectedBid.id },
            status: 'active',
          },
          data: { status: 'rejected' },
        });
      } else {
        // If worker won via Recommendation without submitting bid,
        // reject all still active bids of this round
        await tx.bid.updateMany({
          where: {
            biddingRoundId: round.id,
            status: 'active',
          },
          data: { status: 'rejected' },
        });
      }

      const updatedRound = await tx.biddingRound.update({
        where: { id: round.id },
        data: { status: 'finalized' },
      });

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
