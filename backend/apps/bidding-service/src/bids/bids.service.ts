import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { SubmitBidDto } from './dto/submit-bid.dto.js';
import { ReviseBidDto } from './dto/revise-bid.dto.js';
import { WithdrawBidDto } from './dto/withdraw-bid.dto.js';
import { QueryBidsDto } from './dto/query-bids.dto.js';
import {
  BidListResponseDto,
  BidResponseDto,
  BidRevisionDto,
  WorkerProfileSummaryDto,
} from './dto/bid-response.dto.js';
import {
  BidEligibilityQueryDto,
  BidEligibilityResponseDto,
} from './dto/bid-eligibility.dto.js';
import { WorkerProfileEnricherService } from './services/worker-profile-enricher.service.js';
import { RequestEligibilityVerifierService } from './services/request-eligibility-verifier.service.js';
import { ConfigService } from '@app/config';
import { isTrustedGateway } from '../common/utils/security.util.js';
import { EVENT_PATTERNS, OutboxPublisherService } from '@app/common';
import { SseEventBridgeService } from '../sse/sse-event-bridge.service.js';
import type { Bid, BidRevision, Prisma } from '@prisma/bidding-client';

export const MAX_BID_REVISIONS = 5;
export const ANTI_SNIPING_TRIGGER_WINDOW_MS = 30 * 1000; // 30 giây cuối
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000; // Gia hạn 2 phút
export const MAX_ANTI_SNIPING_EXTENSIONS = 3; // Tối đa 3 lần gia hạn (tổng cộng 6 phút)
export const MIN_REVISION_INTERVAL_MS =
  process.env.BID_REVISION_COOLDOWN_MS !== undefined
    ? Number(process.env.BID_REVISION_COOLDOWN_MS)
    : process.env.NODE_ENV === 'test'
      ? 0
      : 2 * 60 * 1000; // 2 phút

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roundsService: RoundsService,
    @Optional()
    private readonly enricher?: WorkerProfileEnricherService,
    @Optional()
    private readonly requestEligibilityVerifier?: RequestEligibilityVerifierService,
    @Optional()
    private readonly config?: ConfigService,
    @Optional()
    private readonly sseBridge?: SseEventBridgeService,
    @Optional()
    private readonly outboxPublisher?: OutboxPublisherService,
  ) {}

  /**
   * Worker submits a price quote for an open service request.
   */
  async submitBid(
    workerId: string,
    serviceRequestId: string,
    dto: SubmitBidDto,
  ): Promise<BidResponseDto> {
    // 1. Authoritative Request & Worker Eligibility Check (BID-03 / F04)
    if (this.requestEligibilityVerifier) {
      await this.requestEligibilityVerifier.verifyEligibility(
        serviceRequestId,
        workerId,
      );
    }

    let round = await this.prisma.biddingRound.findUnique({
      where: { serviceRequestId },
    });

    if (!round) {
      throw new NotFoundException(
        `Không tìm thấy phiên báo giá cho yêu cầu ${serviceRequestId}`,
      );
    }

    const now = new Date();

    // Check expiration and transition if needed
    if (round.status === 'open' && now >= round.closesAt) {
      await this.roundsService.expireRoundIfNeeded(round, now);
      throw new BadRequestException(
        'Phiên báo giá cho yêu cầu này đã kết thúc',
      );
    }

    // N01: If pending and opensAt <= now, activate on the fly
    if (round.status === 'pending') {
      if (now >= round.opensAt) {
        const activated = await this.roundsService.activateRoundIfNeeded(
          round,
          now,
        );
        if (activated) round = activated;
      } else {
        throw new BadRequestException(
          `Phiên báo giá chưa mở (thời điểm mở dự kiến: ${round.opensAt.toISOString()})`,
        );
      }
    }

    if (round.status !== 'open') {
      throw new BadRequestException(
        `Không thể gửi báo giá khi phiên ở trạng thái "${round.status}"`,
      );
    }

    if (now < round.opensAt) {
      throw new BadRequestException(
        `Phiên báo giá chưa mở (thời điểm mở dự kiến: ${round.opensAt.toISOString()})`,
      );
    }

    if (dto.validUntil) {
      const validUntilDate = new Date(dto.validUntil);
      if (validUntilDate <= now) {
        throw new BadRequestException(
          'Thời hạn báo giá (validUntil) phải lớn hơn thời điểm hiện tại',
        );
      }
    }

    // Check for existing bid by worker in this round before transaction
    const existingBid = await this.prisma.bid.findUnique({
      where: {
        biddingRoundId_workerId: {
          biddingRoundId: round.id,
          workerId,
        },
      },
    });

    if (existingBid) {
      throw new ConflictException(
        'Bạn đã gửi báo giá cho yêu cầu này rồi. Vui lòng sử dụng chức năng điều chỉnh báo giá (PATCH /bids/:id).',
      );
    }

    // Atomic transaction (F06: serialize Round/Bid lifecycle)
    const response = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-verify round state under transaction
      const roundInTx =
        typeof tx.biddingRound?.findUnique === 'function'
          ? await tx.biddingRound.findUnique({ where: { id: round.id } })
          : round;
      let currentRound = roundInTx || round;

      if (currentRound.status === 'pending' && now >= currentRound.opensAt) {
        const activated = await this.roundsService.activateRoundIfNeeded(
          currentRound,
          now,
        );
        if (activated) currentRound = activated;
      }

      if (currentRound.status !== 'open' || now >= currentRound.closesAt) {
        throw new BadRequestException(
          'Phiên báo giá đã đóng hoặc đã kết thúc, không thể nộp báo giá',
        );
      }

      // Re-verify worker unique bid under transaction
      const existingInTx =
        typeof tx.bid?.findUnique === 'function'
          ? await tx.bid.findUnique({
              where: {
                biddingRoundId_workerId: {
                  biddingRoundId: round.id,
                  workerId,
                },
              },
            })
          : null;
      if (existingInTx) {
        throw new ConflictException(
          'Bạn đã gửi báo giá cho yêu cầu này rồi. Vui lòng sử dụng chức năng điều chỉnh báo giá.',
        );
      }

      // Anti-sniping: Nếu gửi báo giá trong 30 giây cuối cùng, tự động gia hạn thêm 2 phút (tối đa MAX_ANTI_SNIPING_EXTENSIONS lần)
      let currentClosesAt = currentRound.closesAt;
      const remainingMs = currentClosesAt.getTime() - now.getTime();
      if (remainingMs > 0 && remainingMs <= ANTI_SNIPING_TRIGGER_WINDOW_MS) {
        const extensionCount =
          typeof tx.outboxEvent.count === 'function'
            ? await tx.outboxEvent.count({
                where: {
                  aggregateId: round.id,
                  eventType: 'bidding.round.extended',
                },
              })
            : 0;

        if (extensionCount < MAX_ANTI_SNIPING_EXTENSIONS) {
          currentClosesAt = new Date(
            currentClosesAt.getTime() + ANTI_SNIPING_EXTENSION_MS,
          );
          await tx.biddingRound.update({
            where: { id: round.id },
            data: { closesAt: currentClosesAt },
          });

          await tx.outboxEvent.create({
            data: {
              aggregateType: 'bidding_round',
              aggregateId: round.id,
              eventType: 'bidding.round.extended',
              eventVersion: 1,
              payload: {
                roundId: round.id,
                serviceRequestId,
                requestId: serviceRequestId,
                previousClosesAt: currentRound.closesAt.toISOString(),
                newClosesAt: currentClosesAt.toISOString(),
                extendedBySeconds: ANTI_SNIPING_EXTENSION_MS / 1000,
                extensionCount: extensionCount + 1,
                maxExtensions: MAX_ANTI_SNIPING_EXTENSIONS,
                reason:
                  'Anti-sniping extension triggered by last-minute bid submission',
              },
            },
          });

          this.logger.log(
            `Anti-sniping kích hoạt (${extensionCount + 1}/${MAX_ANTI_SNIPING_EXTENSIONS}): Phiên ${round.id} được gia hạn thêm 2 phút đến ${currentClosesAt.toISOString()}`,
          );
        } else {
          this.logger.warn(
            `Phiên ${round.id} đã đạt số lần gia hạn Anti-sniping tối đa (${MAX_ANTI_SNIPING_EXTENSIONS}). Không gia hạn thêm.`,
          );
        }
      }

      // P1-02: Serialize with finalize/cancel by acquiring row lock and verifying round open status FIRST
      if (typeof tx.biddingRound.updateMany === 'function') {
        const updateRoundResult = await tx.biddingRound.updateMany({
          where: {
            id: round.id,
            status: 'open',
            closesAt: { gt: now },
          },
          data: {
            bidCount: { increment: 1 },
          },
        });

        if (updateRoundResult.count === 0) {
          throw new BadRequestException(
            'Phiên đấu giá đã kết thúc hoặc không còn nhận báo giá (round closed or finalized)',
          );
        }
      } else {
        await tx.biddingRound.update({
          where: { id: round.id },
          data: {
            bidCount: { increment: 1 },
          },
        });
      }

      // Now create bid under the acquired round lock
      const createdBid = await tx.bid.create({
        data: {
          biddingRoundId: round.id,
          serviceRequestId,
          workerId,
          amount: dto.amount,
          message: dto.message || null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          status: 'active',
          version: 1,
          submittedAt: now,
        },
      });

      // Write Outbox Event: bid.submitted
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bid',
          aggregateId: createdBid.id,
          eventType: EVENT_PATTERNS.BID_SUBMITTED,
          eventVersion: 1,
          payload: {
            bidId: createdBid.id,
            biddingRoundId: round.id,
            serviceRequestId,
            requestId: serviceRequestId,
            customerId: round.customerId || null,
            workerId,
            amount: Number(createdBid.amount),
            message: createdBid.message,
            validUntil: createdBid.validUntil
              ? createdBid.validUntil.toISOString()
              : null,
            submittedAt: createdBid.submittedAt.toISOString(),
          },
        },
      });

      const response = this.mapToBidResponse(createdBid, 0);

      return response;
    });

    void this.outboxPublisher?.triggerPublish();

    return response;
  }

  /**
   * Worker revises their existing quote.
   * Employs true atomic CAS update (F05) in database to prevent concurrent overwrites.
   */
  async reviseBid(
    workerId: string,
    bidId: string,
    dto: ReviseBidDto,
  ): Promise<BidResponseDto> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        biddingRound: true,
        revisions: true,
      },
    });

    if (!bid) {
      throw new NotFoundException(`Không tìm thấy báo giá ${bidId}`);
    }

    if (bid.workerId !== workerId) {
      throw new ForbiddenException('Bạn không có quyền điều chỉnh báo giá này');
    }

    if (bid.status !== 'active') {
      throw new BadRequestException(
        `Chỉ có thể điều chỉnh báo giá đang hoạt động (trạng thái hiện tại: "${bid.status}")`,
      );
    }

    const now = new Date();
    const round = bid.biddingRound;

    // Check round expiration
    if (round.status === 'open' && now >= round.closesAt) {
      await this.roundsService.expireRoundIfNeeded(round, now);
      throw new BadRequestException(
        'Phiên báo giá đã kết thúc, không thể điều chỉnh',
      );
    }

    if (round.status !== 'open') {
      throw new BadRequestException(
        `Không thể điều chỉnh khi phiên ở trạng thái "${round.status}"`,
      );
    }

    // Fail-fast version check
    if (bid.version !== dto.version) {
      throw new ConflictException(
        `Dữ liệu báo giá đã được cập nhật bởi một yêu cầu khác (phiên bản hiện tại: ${bid.version}, phiên bản gửi lên: ${dto.version}). Vui lòng tải lại và thử lại.`,
      );
    }

    if (dto.validUntil) {
      const validUntilDate = new Date(dto.validUntil);
      if (validUntilDate <= now) {
        throw new BadRequestException(
          'Thời hạn báo giá (validUntil) phải lớn hơn thời điểm hiện tại',
        );
      }
    }

    // Anti-Abuse: Giới hạn tối đa 5 lần điều chỉnh báo giá cho mỗi phiên
    if (bid.revisions.length >= MAX_BID_REVISIONS) {
      throw new BadRequestException(
        `Bạn đã đạt giới hạn tối đa ${MAX_BID_REVISIONS} lần điều chỉnh báo giá cho yêu cầu này`,
      );
    }

    // Anti-Abuse: Giới hạn thời gian giãn cách giữa 2 lần sửa liên tiếp (tối thiểu 2 phút)
    if (MIN_REVISION_INTERVAL_MS > 0 && bid.revisions.length > 0) {
      const lastRevisionTime = new Date(
        Math.max(...bid.revisions.map((r) => new Date(r.revisedAt).getTime())),
      );
      const elapsedMs = now.getTime() - lastRevisionTime.getTime();
      if (elapsedMs < MIN_REVISION_INTERVAL_MS) {
        const remainingSec = Math.ceil(
          (MIN_REVISION_INTERVAL_MS - elapsedMs) / 1000,
        );
        throw new BadRequestException(
          `Vui lòng đợi thêm ${remainingSec} giây trước khi thực hiện lần điều chỉnh tiếp theo (khoảng cách tối thiểu giữa 2 lần sửa là 2 phút).`,
        );
      }
    }

    const newAmount =
      dto.amount !== undefined ? dto.amount : Number(bid.amount);
    const newMessage = dto.message !== undefined ? dto.message : bid.message;
    const newValidUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : bid.validUntil;

    // Atomic CAS Transaction (F05 & F06)
    const response = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Re-check round status in transaction
      const roundInTx =
        typeof tx.biddingRound?.findUnique === 'function'
          ? await tx.biddingRound.findUnique({ where: { id: round.id } })
          : round;
      const currentRound = roundInTx || round;

      if (currentRound.status !== 'open' || now >= currentRound.closesAt) {
        throw new BadRequestException(
          'Phiên báo giá đã kết thúc hoặc đã đóng, không thể điều chỉnh',
        );
      }

      // Anti-sniping (tối đa MAX_ANTI_SNIPING_EXTENSIONS lần)
      const remainingMs = currentRound.closesAt.getTime() - now.getTime();
      if (remainingMs > 0 && remainingMs <= ANTI_SNIPING_TRIGGER_WINDOW_MS) {
        const extensionCount =
          typeof tx.outboxEvent.count === 'function'
            ? await tx.outboxEvent.count({
                where: {
                  aggregateId: round.id,
                  eventType: 'bidding.round.extended',
                },
              })
            : 0;

        if (extensionCount < MAX_ANTI_SNIPING_EXTENSIONS) {
          const newClosesAt = new Date(
            currentRound.closesAt.getTime() + ANTI_SNIPING_EXTENSION_MS,
          );
          await tx.biddingRound.update({
            where: { id: round.id },
            data: { closesAt: newClosesAt },
          });

          await tx.outboxEvent.create({
            data: {
              aggregateType: 'bidding_round',
              aggregateId: round.id,
              eventType: 'bidding.round.extended',
              eventVersion: 1,
              payload: {
                roundId: round.id,
                serviceRequestId: bid.serviceRequestId,
                requestId: bid.serviceRequestId,
                previousClosesAt: currentRound.closesAt.toISOString(),
                newClosesAt: newClosesAt.toISOString(),
                extendedBySeconds: ANTI_SNIPING_EXTENSION_MS / 1000,
                extensionCount: extensionCount + 1,
                maxExtensions: MAX_ANTI_SNIPING_EXTENSIONS,
                reason:
                  'Anti-sniping extension triggered by last-minute bid revision',
              },
            },
          });

          this.logger.log(
            `Anti-sniping kích hoạt qua điều chỉnh báo giá (${extensionCount + 1}/${MAX_ANTI_SNIPING_EXTENSIONS}): Phiên ${round.id} được gia hạn đến ${newClosesAt.toISOString()}`,
          );
        } else {
          this.logger.warn(
            `Phiên ${round.id} đã đạt số lần gia hạn Anti-sniping tối đa (${MAX_ANTI_SNIPING_EXTENSIONS}). Không gia hạn thêm.`,
          );
        }
      }

      const revisionNo = bid.revisions.length + 1;

      // Create BidRevision record first so it is persisted in DB (N02)
      const createdRevision = await tx.bidRevision.create({
        data: {
          bidId: bid.id,
          revisionNo,
          previousAmount: bid.amount,
          newAmount,
          previousMessage: bid.message,
          newMessage,
          revisedAt: now,
        },
      });

      let updatedBid: any;
      if (typeof tx.bid.updateMany === 'function') {
        // Atomic Compare-And-Swap UPDATE (F05)
        const updateResult = await tx.bid.updateMany({
          where: {
            id: bid.id,
            workerId,
            version: dto.version,
            status: 'active',
          },
          data: {
            amount: newAmount,
            message: newMessage,
            validUntil: newValidUntil,
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            'Xung đột phiên bản dữ liệu (optimistic lock mismatch) hoặc báo giá đã bị thay đổi bởi yêu cầu khác',
          );
        }

        updatedBid =
          typeof tx.bid.findUniqueOrThrow === 'function'
            ? await tx.bid.findUniqueOrThrow({
                where: { id: bid.id },
                include: {
                  revisions: { orderBy: { revisionNo: 'asc' } },
                },
              })
            : await tx.bid.findUnique({
                where: { id: bid.id },
                include: {
                  revisions: { orderBy: { revisionNo: 'asc' } },
                },
              });
      } else {
        // Fallback for unit testing mocks
        updatedBid = await tx.bid.update({
          where: { id: bid.id },
          data: {
            amount: newAmount,
            message: newMessage,
            validUntil: newValidUntil,
            version: { increment: 1 },
            updatedAt: now,
          },
          include: {
            revisions: {
              orderBy: { revisionNo: 'asc' },
            },
          },
        });
      }

      // Write Outbox Event: bid.revised
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bid',
          aggregateId: bid.id,
          eventType: EVENT_PATTERNS.BID_REVISED,
          eventVersion: 1,
          payload: {
            bidId: bid.id,
            biddingRoundId: bid.biddingRoundId,
            serviceRequestId: bid.serviceRequestId,
            requestId: bid.serviceRequestId,
            customerId: bid.biddingRound?.customerId || null,
            workerId,
            revisionNo,
            previousAmount: Number(bid.amount),
            newAmount,
            previousMessage: bid.message,
            newMessage,
            version: updatedBid.version,
            validUntil: newValidUntil ? newValidUntil.toISOString() : null,
            revisedAt: now.toISOString(),
          },
        },
      });

      // Ensure returned revisions list contains the newly created revision (N02)
      let revisionsList: BidRevision[] = updatedBid?.revisions || [];
      if (!revisionsList.some((r: any) => r.revisionNo === revisionNo)) {
        revisionsList = [...(bid.revisions || []), createdRevision];
      }

      const response = this.mapToBidResponse(updatedBid, revisionNo, revisionsList);

      return response;
    });

    void this.outboxPublisher?.triggerPublish();

    return response;
  }

  /**
   * Worker withdraws their quote.
   * Employs true atomic CAS update (F05) with mandatory version.
   */
  async withdrawBid(
    workerId: string,
    bidId: string,
    dto: WithdrawBidDto,
  ): Promise<BidResponseDto> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        biddingRound: true,
        revisions: true,
      },
    });

    if (!bid) {
      throw new NotFoundException(`Không tìm thấy báo giá ${bidId}`);
    }

    if (bid.workerId !== workerId) {
      throw new ForbiddenException('Bạn không có quyền rút báo giá này');
    }

    if (bid.status !== 'active') {
      throw new BadRequestException(
        `Chỉ có thể rút báo giá đang hoạt động (trạng thái hiện tại: "${bid.status}")`,
      );
    }

    const now = new Date();
    const round = bid.biddingRound;

    if (round.status === 'open' && now >= round.closesAt) {
      await this.roundsService.expireRoundIfNeeded(round, now);
      throw new BadRequestException('Phiên báo giá đã kết thúc, không thể rút');
    }

    if (round.status !== 'open') {
      throw new BadRequestException(
        `Không thể rút khi phiên ở trạng thái "${round.status}"`,
      );
    }

    // Fail-fast version check
    if (dto.version !== undefined && bid.version !== dto.version) {
      throw new ConflictException(
        `Phiên bản báo giá đã thay đổi (${bid.version} != ${dto.version}). Vui lòng kiểm tra lại.`,
      );
    }

    // Atomic CAS Transaction (F05 & F06)
    const response = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const roundInTx =
        typeof tx.biddingRound?.findUnique === 'function'
          ? await tx.biddingRound.findUnique({ where: { id: round.id } })
          : round;
      const currentRound = roundInTx || round;

      if (currentRound.status !== 'open' || now >= currentRound.closesAt) {
        throw new BadRequestException(
          'Phiên báo giá đã đóng hoặc kết thúc, không thể rút',
        );
      }

      let updatedBid: any;
      if (typeof tx.bid.updateMany === 'function') {
        // Atomic Compare-And-Swap UPDATE (F05)
        const updateResult = await tx.bid.updateMany({
          where: {
            id: bid.id,
            workerId,
            version: dto.version,
            status: 'active',
          },
          data: {
            status: 'withdrawn',
            version: { increment: 1 },
            updatedAt: now,
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            'Xung đột phiên bản dữ liệu (optimistic lock mismatch) hoặc báo giá đã bị thay đổi trước đó',
          );
        }

        updatedBid =
          typeof tx.bid.findUniqueOrThrow === 'function'
            ? await tx.bid.findUniqueOrThrow({
                where: { id: bid.id },
                include: {
                  revisions: true,
                },
              })
            : await tx.bid.findUnique({
                where: { id: bid.id },
                include: {
                  revisions: true,
                },
              });
      } else {
        updatedBid = await tx.bid.update({
          where: { id: bid.id },
          data: {
            status: 'withdrawn',
            version: { increment: 1 },
            updatedAt: now,
          },
          include: {
            revisions: true,
          },
        });
      }

      // Decrement round bidCount when a bid is withdrawn
      if (typeof tx.biddingRound?.updateMany === 'function') {
        await tx.biddingRound.updateMany({
          where: { id: bid.biddingRoundId, bidCount: { gt: 0 } },
          data: {
            bidCount: { decrement: 1 },
          },
        });
      } else if (typeof tx.biddingRound?.update === 'function') {
        await tx.biddingRound.update({
          where: { id: bid.biddingRoundId },
          data: {
            bidCount: { decrement: 1 },
          },
        });
      }

      // Write Outbox Event: bid.withdrawn
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'bid',
          aggregateId: bid.id,
          eventType: EVENT_PATTERNS.BID_WITHDRAWN,
          eventVersion: 1,
          payload: {
            bidId: bid.id,
            biddingRoundId: bid.biddingRoundId,
            serviceRequestId: bid.serviceRequestId,
            requestId: bid.serviceRequestId,
            customerId: bid.biddingRound?.customerId || null,
            workerId,
            reason: dto.reason || null,
            version: updatedBid.version,
            withdrawnAt: now.toISOString(),
          },
        },
      });

      const response = this.mapToBidResponse(
        updatedBid,
        updatedBid.revisions?.length || 0,
      );

      return response;
    });

    void this.outboxPublisher?.triggerPublish();

    return response;
  }

  /**
   * Retrieves list of bids for a service request.
   * Sorted with latest submissions on top (submittedAt DESC).
   * Note: Clicking a bid never changes status to selected!
   * Sealed-bid (F03): Masks amount, message, and revisions for competitor workers and unauthorized users.
   */
  async getBidsForRequest(
    serviceRequestId: string,
    query: QueryBidsDto,
    currentUserId?: string,
    userRoles?: string,
    internalSecret?: string,
  ): Promise<BidListResponseDto> {
    const expectedSecret =
      this.config?.get?.('INTERNAL_SERVICE_SECRET') ||
      this.config?.get?.('INTERNAL_SECRET') ||
      process.env.INTERNAL_SERVICE_SECRET ||
      process.env.INTERNAL_SECRET ||
      (process.env.NODE_ENV === 'test' ? 'test-internal-secret' : undefined);

    // Only trust identity headers if request passes internal secret check (R01 / F03)
    const isGatewayTrusted = isTrustedGateway(internalSecret, expectedSecret);
    const roles =
      isGatewayTrusted && userRoles
        ? userRoles.split(',').map((r) => r.trim().toLowerCase())
        : [];
    const verifiedUserId = isGatewayTrusted ? currentUserId : undefined;

    const isAdminOrOperator =
      roles.includes('admin') || roles.includes('operator');

    const where: Prisma.BidWhereInput = {
      serviceRequestId,
      ...(query.status && query.status !== 'all'
        ? { status: query.status as any }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [total, bids, round, allBidders] = await Promise.all([
      this.prisma.bid.count({ where }),
      this.prisma.bid.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          _count: {
            select: { revisions: true },
          },
        },
      }),
      this.prisma.biddingRound.findUnique({
        where: { serviceRequestId },
        select: { customerId: true },
      }),
      this.prisma.bid.findMany({
        where: { serviceRequestId, status: 'active' },
        select: { workerId: true },
        distinct: ['workerId'],
      }),
    ]);

    const isRequestOwnerCustomer = Boolean(
      round?.customerId &&
      verifiedUserId &&
      round.customerId === verifiedUserId &&
      roles.includes('customer'),
    );

    const workerIds = Array.from(new Set(bids.map((b) => b.workerId)));
    const profileMap = this.enricher
      ? await this.enricher.enrichWorkerProfiles(workerIds)
      : new Map<string, WorkerProfileSummaryDto>();

    const items = bids.map((b) => {
      const isOwnerWorker = Boolean(
        verifiedUserId &&
        b.workerId === verifiedUserId &&
        roles.includes('worker'),
      );

      // Sealed-bid: Only verified request customer owner, worker who owns this specific bid, or admin/operator sees real price
      const canSeeRealPrice =
        isAdminOrOperator || isRequestOwnerCustomer || isOwnerWorker;

      if (!canSeeRealPrice) {
        // Blind Bidding (Đấu giá kín): Che giá và nội dung đối với thợ đối thủ hoặc khách hàng không sở hữu
        return {
          id: b.id,
          biddingRoundId: b.biddingRoundId,
          serviceRequestId: b.serviceRequestId,
          workerId: b.workerId,
          amount: 0,
          message:
            '[Báo giá kín - Chỉ khách hàng sở hữu yêu cầu mới có quyền xem]',
          validUntil: null,
          status: b.status,
          version: b.version,
          submittedAt: b.submittedAt,
          revisionsCount: b._count.revisions,
          isMasked: true,
          workerProfile: null,
        };
      }

      return {
        ...this.mapToBidResponse(
          b,
          b._count.revisions,
          undefined,
          profileMap.get(b.workerId) || null,
        ),
        isMasked: false,
      };
    });

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      allBidderWorkerIds: allBidders.map((b) => b.workerId),
    };
  }

  /**
   * Retrieves a single bid with its complete revision history.
   * Sealed-bid (F03): Masks amount and hides revision history if caller is competitor.
   */
  async getBidById(
    bidId: string,
    currentUserId?: string,
    userRoles?: string,
    internalSecret?: string,
  ): Promise<BidResponseDto> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        biddingRound: {
          select: { customerId: true },
        },
        revisions: {
          orderBy: { revisionNo: 'asc' },
        },
      },
    });

    if (!bid) {
      throw new NotFoundException(`Không tìm thấy báo giá ${bidId}`);
    }

    const expectedSecret =
      this.config?.get?.('INTERNAL_SERVICE_SECRET') ||
      this.config?.get?.('INTERNAL_SECRET') ||
      process.env.INTERNAL_SERVICE_SECRET ||
      process.env.INTERNAL_SECRET ||
      (process.env.NODE_ENV === 'test' ? 'test-internal-secret' : undefined);

    const isGatewayTrusted = isTrustedGateway(internalSecret, expectedSecret);
    const roles =
      isGatewayTrusted && userRoles
        ? userRoles.split(',').map((r) => r.trim().toLowerCase())
        : [];
    const verifiedUserId = isGatewayTrusted ? currentUserId : undefined;

    const isAdminOrOperator =
      roles.includes('admin') || roles.includes('operator');
    const isRequestOwnerCustomer = Boolean(
      bid.biddingRound?.customerId &&
      verifiedUserId &&
      bid.biddingRound.customerId === verifiedUserId &&
      roles.includes('customer'),
    );
    const isOwnerWorker = Boolean(
      verifiedUserId &&
      bid.workerId === verifiedUserId &&
      roles.includes('worker'),
    );

    const canSeeRealPrice =
      isAdminOrOperator || isRequestOwnerCustomer || isOwnerWorker;

    if (!canSeeRealPrice) {
      // F03: Competitor, other customer, or direct external caller cannot see competitor's price and revision history
      return {
        id: bid.id,
        biddingRoundId: bid.biddingRoundId,
        serviceRequestId: bid.serviceRequestId,
        workerId: bid.workerId,
        amount: 0,
        message:
          '[Báo giá kín - Bạn không có quyền xem chi tiết giá của đối thủ]',
        validUntil: null,
        status: bid.status,
        version: bid.version,
        submittedAt: bid.submittedAt,
        revisionsCount: bid.revisions.length,
        isMasked: true,
        workerProfile: null,
        revisions: [],
      };
    }

    let workerProfile: WorkerProfileSummaryDto | null = null;
    if (this.enricher) {
      const profileMap = await this.enricher.enrichWorkerProfiles([
        bid.workerId,
      ]);
      workerProfile = profileMap.get(bid.workerId) || null;
    }

    return {
      ...this.mapToBidResponse(
        bid,
        bid.revisions.length,
        bid.revisions,
        workerProfile,
      ),
      isMasked: false,
    };
  }

  /**
   * Retrieves all bids submitted by the authenticated worker across requests.
   */
  async getMyBids(
    workerId: string,
    query: QueryBidsDto,
  ): Promise<BidListResponseDto> {
    const where: Prisma.BidWhereInput = {
      workerId,
      ...(query.status && query.status !== 'all'
        ? { status: query.status as any }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [total, bids] = await Promise.all([
      this.prisma.bid.count({ where }),
      this.prisma.bid.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip,
        take: query.limit,
        include: {
          _count: {
            select: { revisions: true },
          },
        },
      }),
    ]);

    const items = bids.map((b) => this.mapToBidResponse(b, b._count.revisions));

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Internal API: Checks whether a specific bid is eligible for Order creation.
   * Called by Order Service during booking proposal/order creation.
   */
  async checkEligibility(
    bidId: string,
    query: BidEligibilityQueryDto,
  ): Promise<BidEligibilityResponseDto> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        biddingRound: true,
      },
    });

    if (!bid) {
      return {
        eligible: false,
        reason: 'Báo giá không tồn tại',
      };
    }

    if (bid.serviceRequestId !== query.requestId) {
      return {
        eligible: false,
        reason: 'Báo giá không thuộc về yêu cầu dịch vụ được chỉ định',
      };
    }

    if (bid.workerId !== query.workerId) {
      return {
        eligible: false,
        reason: 'Báo giá không thuộc về thợ được chỉ định',
      };
    }

    if (bid.status !== 'active') {
      return {
        eligible: false,
        reason: `Báo giá không còn ở trạng thái khả dụng (trạng thái: ${bid.status})`,
      };
    }

    const now = new Date();
    if (bid.validUntil && bid.validUntil <= now) {
      return {
        eligible: false,
        reason: 'Báo giá đã hết hạn hiệu lực',
      };
    }

    if (bid.biddingRound.status === 'cancelled') {
      return {
        eligible: false,
        reason: 'Phiên báo giá của yêu cầu này đã bị hủy',
      };
    }

    return {
      eligible: true,
      bid: {
        id: bid.id,
        serviceRequestId: bid.serviceRequestId,
        workerId: bid.workerId,
        amount: Number(bid.amount),
        status: bid.status,
        version: bid.version,
        validUntil: bid.validUntil,
      },
    };
  }

  private mapToBidResponse(
    bid: Bid,
    revisionsCount: number,
    revisions?: BidRevision[],
    workerProfile?: WorkerProfileSummaryDto | null,
  ): BidResponseDto {
    return {
      id: bid.id,
      biddingRoundId: bid.biddingRoundId,
      serviceRequestId: bid.serviceRequestId,
      workerId: bid.workerId,
      amount: Number(bid.amount),
      message: bid.message,
      validUntil: bid.validUntil,
      status: bid.status,
      version: bid.version,
      submittedAt: bid.submittedAt,
      revisionsCount,
      workerProfile: workerProfile ?? null,
      ...(revisions
        ? {
            revisions: revisions.map((r) => this.mapToRevisionDto(r)),
          }
        : {}),
    };
  }

  private mapToRevisionDto(revision: BidRevision): BidRevisionDto {
    return {
      id: revision.id,
      revisionNo: revision.revisionNo,
      previousAmount: Number(revision.previousAmount),
      newAmount: Number(revision.newAmount),
      previousMessage: revision.previousMessage,
      newMessage: revision.newMessage,
      revisedAt: revision.revisedAt,
    };
  }
}
