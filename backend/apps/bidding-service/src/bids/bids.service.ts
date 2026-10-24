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
import { EVENT_PATTERNS } from '@app/common';
import type { Bid, BidRevision, Prisma } from '@prisma/bidding-client';

export const MAX_BID_REVISIONS = 5;
export const ANTI_SNIPING_TRIGGER_WINDOW_MS = 30 * 1000; // 30 giây cuối
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000; // Gia hạn 2 phút
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
  ) {}

  /**
   * Worker submits a price quote for an open service request.
   */
  async submitBid(
    workerId: string,
    serviceRequestId: string,
    dto: SubmitBidDto,
  ): Promise<BidResponseDto> {
    const round = await this.prisma.biddingRound.findUnique({
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
      throw new BadRequestException('Phiên báo giá cho yêu cầu này đã kết thúc');
    }

    if (round.status !== 'open') {
      throw new BadRequestException(
        `Không thể gửi báo giá khi phiên ở trạng thái "${round.status}"`,
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

    // Check for existing bid by worker in this round
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

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Anti-sniping: Nếu gửi báo giá trong 30 giây cuối cùng, tự động gia hạn thêm 2 phút
      const remainingMs = round.closesAt.getTime() - now.getTime();
      if (remainingMs > 0 && remainingMs <= ANTI_SNIPING_TRIGGER_WINDOW_MS) {
        const newClosesAt = new Date(
          round.closesAt.getTime() + ANTI_SNIPING_EXTENSION_MS,
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
              serviceRequestId,
              previousClosesAt: round.closesAt.toISOString(),
              newClosesAt: newClosesAt.toISOString(),
              extendedBySeconds: ANTI_SNIPING_EXTENSION_MS / 1000,
              reason:
                'Anti-sniping extension triggered by last-minute bid submission',
            },
          },
        });

        this.logger.log(
          `Anti-sniping kích hoạt: Phiên ${round.id} được gia hạn thêm 2 phút đến ${newClosesAt.toISOString()}`,
        );
      }

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

      // Increment round bidCount
      await tx.biddingRound.update({
        where: { id: round.id },
        data: {
          bidCount: { increment: 1 },
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

      return this.mapToBidResponse(createdBid, 0);
    });
  }

  /**
   * Worker revises their existing quote.
   * Employs optimistic locking with 'version' to prevent concurrent overwrites.
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
      throw new BadRequestException('Phiên báo giá đã kết thúc, không thể điều chỉnh');
    }

    if (round.status !== 'open') {
      throw new BadRequestException(
        `Không thể điều chỉnh khi phiên ở trạng thái "${round.status}"`,
      );
    }

    // Optimistic Concurrency Check
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
        Math.max(
          ...bid.revisions.map((r) => new Date(r.revisedAt).getTime()),
        ),
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

    const newAmount = dto.amount !== undefined ? dto.amount : Number(bid.amount);
    const newMessage = dto.message !== undefined ? dto.message : bid.message;
    const newValidUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : bid.validUntil;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Anti-sniping: Nếu điều chỉnh báo giá trong 30 giây cuối cùng, gia hạn thêm 2 phút
      const remainingMs = round.closesAt.getTime() - now.getTime();
      if (remainingMs > 0 && remainingMs <= ANTI_SNIPING_TRIGGER_WINDOW_MS) {
        const newClosesAt = new Date(
          round.closesAt.getTime() + ANTI_SNIPING_EXTENSION_MS,
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
              previousClosesAt: round.closesAt.toISOString(),
              newClosesAt: newClosesAt.toISOString(),
              extendedBySeconds: ANTI_SNIPING_EXTENSION_MS / 1000,
              reason:
                'Anti-sniping extension triggered by last-minute bid revision',
            },
          },
        });

        this.logger.log(
          `Anti-sniping kích hoạt: Phiên ${round.id} được gia hạn thêm 2 phút do điều chỉnh giá phút chót`,
        );
      }

      const revisionNo = bid.revisions.length + 1;

      // Create BidRevision record
      await tx.bidRevision.create({
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

      // Update Bid with incremented version
      const updatedBid = await tx.bid.update({
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
            workerId,
            revisionNo,
            previousAmount: Number(bid.amount),
            newAmount,
            previousMessage: bid.message,
            newMessage,
            version: updatedBid.version,
            revisedAt: now.toISOString(),
          },
        },
      });

      return this.mapToBidResponse(updatedBid, updatedBid.revisions.length, updatedBid.revisions);
    });
  }

  /**
   * Worker withdraws their quote.
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

    if (dto.version !== undefined && bid.version !== dto.version) {
      throw new ConflictException(
        `Phiên bản báo giá đã thay đổi (${bid.version} != ${dto.version}). Vui lòng kiểm tra lại.`,
      );
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedBid = await tx.bid.update({
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
            workerId,
            reason: dto.reason || null,
            withdrawnAt: now.toISOString(),
          },
        },
      });

      return this.mapToBidResponse(updatedBid, updatedBid.revisions.length);
    });
  }

  /**
   * Retrieves list of bids for a service request.
   * Sorted with latest submissions on top (submittedAt DESC).
   * Note: Clicking a bid never changes status to selected!
   */
  async getBidsForRequest(
    serviceRequestId: string,
    query: QueryBidsDto,
    currentUserId?: string,
    userRoles?: string,
  ): Promise<BidListResponseDto> {
    const roles = userRoles
      ? userRoles.split(',').map((r) => r.trim().toLowerCase())
      : [];
    const isWorker = roles.includes('worker');
    const isCustomerOrAdmin =
      roles.includes('customer') ||
      roles.includes('admin') ||
      roles.includes('operator');
    // Cơ chế Đấu giá kín: Nếu người xem là Thợ (và không phải Admin) thì ẩn giá đối thủ
    const shouldMaskCompetitors = isWorker && !isCustomerOrAdmin;

    const where: Prisma.BidWhereInput = {
      serviceRequestId,
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

    const workerIds = Array.from(new Set(bids.map((b) => b.workerId)));
    const profileMap = this.enricher
      ? await this.enricher.enrichWorkerProfiles(workerIds)
      : new Map<string, WorkerProfileSummaryDto>();

    const items = bids.map((b) => {
      const isOwnerWorker = currentUserId && b.workerId === currentUserId;
      if (shouldMaskCompetitors && !isOwnerWorker) {
        // Blind Bidding (Đấu giá kín): Che giá và nội dung đối với thợ đối thủ
        return {
          id: b.id,
          biddingRoundId: b.biddingRoundId,
          serviceRequestId: b.serviceRequestId,
          workerId: b.workerId,
          amount: 0,
          message: '[Báo giá kín - Chỉ khách hàng sở hữu yêu cầu mới có quyền xem]',
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
    };
  }

  /**
   * Retrieves a single bid with its complete revision history.
   */
  async getBidById(bidId: string): Promise<BidResponseDto> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        revisions: {
          orderBy: { revisionNo: 'asc' },
        },
      },
    });

    if (!bid) {
      throw new NotFoundException(`Không tìm thấy báo giá ${bidId}`);
    }

    let workerProfile: WorkerProfileSummaryDto | null = null;
    if (this.enricher) {
      const profileMap = await this.enricher.enrichWorkerProfiles([bid.workerId]);
      workerProfile = profileMap.get(bid.workerId) || null;
    }

    return this.mapToBidResponse(
      bid,
      bid.revisions.length,
      bid.revisions,
      workerProfile,
    );
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

    const items = bids.map((b) =>
      this.mapToBidResponse(b, b._count.revisions),
    );

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
