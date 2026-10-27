import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  BookingProposalStatus,
  RequestStatus,
} from '@prisma/order-client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrderOutboxRepository } from '../../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../../common/constants/order.constants.js';

@Injectable()
export class OrderDeadlineSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrderDeadlineSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: OrderOutboxRepository,
  ) {}

  onModuleInit(): void {
    // Run scan every 60 seconds
    this.timer = setInterval(() => {
      void this.checkDeadlines();
    }, 60000);
    this.timer.unref?.();
    this.logger.log('Order deadline background scheduler initialized (interval: 60s)');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Main deadline scanner:
   * 1. Transitions `open_for_bidding` -> `bidding_closed` when `bidding_closes_at <= now`.
   * 2. Transitions open requests -> `expired` when `selection_expires_at <= now` and expires their proposals.
   */
  async checkDeadlines(now = new Date()): Promise<{
    biddingClosedCount: number;
    expiredCount: number;
  }> {
    if (this.isProcessing) {
      this.logger.debug('Previous deadline scan cycle is still executing, skipping');
      return { biddingClosedCount: 0, expiredCount: 0 };
    }

    this.isProcessing = true;
    let biddingClosedCount = 0;
    let expiredCount = 0;

    try {
      // 1. Scan for requests whose bidding window has closed
      const requestsToCloseBidding = await this.prisma.serviceRequest.findMany({
        where: {
          status: RequestStatus.open_for_bidding,
          biddingClosesAt: { lte: now },
        },
        select: {
          id: true,
          requestCode: true,
          customerUserId: true,
        },
        take: 50,
      });

      for (const req of requestsToCloseBidding) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.serviceRequest.update({
              where: { id: req.id },
              data: {
                status: RequestStatus.bidding_closed,
                version: { increment: 1 },
              },
            });

            await this.outboxRepo.createEvent(
              {
                aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
                aggregateId: req.id,
                eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_BIDDING_CLOSED,
                eventVersion: 1,
                payload: {
                  requestId: req.id,
                  requestCode: req.requestCode,
                  customerUserId: req.customerUserId,
                  biddingClosedAt: now.toISOString(),
                },
              },
              tx,
            );
          });
          biddingClosedCount++;
        } catch (err) {
          this.logger.error(
            `Failed to close bidding for request ${req.id}: ${(err as Error).message}`,
          );
        }
      }

      // 2. Scan for requests whose 48h selection window has expired
      const requestsToExpire = await this.prisma.serviceRequest.findMany({
        where: {
          status: {
            in: [RequestStatus.open_for_bidding, RequestStatus.bidding_closed],
          },
          selectionExpiresAt: { lte: now },
        },
        select: {
          id: true,
          requestCode: true,
          customerUserId: true,
        },
        take: 50,
      });

      for (const req of requestsToExpire) {
        try {
          await this.prisma.$transaction(async (tx) => {
            // Expire all open proposals for this request
            await tx.bookingProposal.updateMany({
              where: {
                serviceRequestId: req.id,
                status: BookingProposalStatus.proposed,
              },
              data: {
                status: BookingProposalStatus.expired,
              },
            });

            await tx.serviceRequest.update({
              where: { id: req.id },
              data: {
                status: RequestStatus.expired,
                version: { increment: 1 },
              },
            });

            await this.outboxRepo.createEvent(
              {
                aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
                aggregateId: req.id,
                eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_EXPIRED,
                eventVersion: 1,
                payload: {
                  requestId: req.id,
                  requestCode: req.requestCode,
                  customerUserId: req.customerUserId,
                  expiredAt: now.toISOString(),
                },
              },
              tx,
            );
          });
          expiredCount++;
        } catch (err) {
          this.logger.error(
            `Failed to expire request ${req.id}: ${(err as Error).message}`,
          );
        }
      }

      if (biddingClosedCount > 0 || expiredCount > 0) {
        this.logger.log(
          `Deadline scan complete: closed bidding for ${biddingClosedCount} requests, expired ${expiredCount} requests`,
        );
      }
    } finally {
      this.isProcessing = false;
    }

    return { biddingClosedCount, expiredCount };
  }
}
