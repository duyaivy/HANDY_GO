import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma, TrackingEntityType } from '@prisma/tracking-client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';
import type { TimelineQueryDto } from './dto/timeline-query.dto.js';
import type {
  TimelineListResponseDto,
  TimelineEventItemDto,
} from './dto/timeline-response.dto.js';

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the combined timeline of a Service Request flow.
   * Enforces role-based visibility rules (TRK-03 & TRK-04).
   */
  async getRequestTimeline(
    serviceRequestId: string,
    query: TimelineQueryDto,
    user: GatewayUser,
  ): Promise<TimelineListResponseDto> {
    const flow = await this.prisma.trackingFlow.findUnique({
      where: { serviceRequestId },
    });

    if (!flow) {
      throw new NotFoundException(
        `Không tìm thấy tiến trình theo dõi cho yêu cầu: ${serviceRequestId}`,
      );
    }

    // Role-based authorization
    if (!user.isAdmin) {
      if (user.isCustomer && flow.customerId && flow.customerId !== user.userId) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập tiến trình của yêu cầu này',
        );
      }

      if (user.isWorker && !user.isCustomer) {
        // Verify worker has participated in this request
        const participation = await this.prisma.trackingEvent.findFirst({
          where: {
            trackingFlowId: flow.id,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
            ],
          },
        });

        if (!participation) {
          throw new ForbiddenException(
            'Thợ không có quyền truy cập tiến trình của yêu cầu này do chưa tham gia',
          );
        }
      }
    }

    // Build Prisma where conditions
    const whereConditions: Prisma.TrackingEventWhereInput[] = [
      { trackingFlowId: flow.id },
    ];

    if (query.entityType) {
      whereConditions.push({ entityType: query.entityType });
    }

    // For Worker: hide competing bids and competitor negotiation proposals
    if (user.isWorker && !user.isAdmin) {
      whereConditions.push({
        OR: [
          {
            entityType: {
              in: [
                TrackingEntityType.service_request,
                TrackingEntityType.matching,
                TrackingEntityType.bidding_round,
              ],
            },
          },
          {
            entityType: TrackingEntityType.bid,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
            ],
          },
          {
            entityType: TrackingEntityType.booking_proposal,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
            ],
          },
          {
            entityType: TrackingEntityType.order,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
            ],
          },
          {
            entityType: TrackingEntityType.payment,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
            ],
          },
        ],
      });
    }

    const where: Prisma.TrackingEventWhereInput = { AND: whereConditions };

    return this.queryPaginatedTimeline(where, query);
  }

  /**
   * Retrieves the timeline for a specific bid.
   */
  async getBidTimeline(
    bidId: string,
    query: TimelineQueryDto,
    user: GatewayUser,
  ): Promise<TimelineListResponseDto> {
    const firstBidEvent = await this.prisma.trackingEvent.findFirst({
      where: {
        entityType: TrackingEntityType.bid,
        entityId: bidId,
      },
      include: {
        trackingFlow: true,
      },
    });

    if (!firstBidEvent) {
      throw new NotFoundException(
        `Không tìm thấy lịch sử sự kiện cho báo giá: ${bidId}`,
      );
    }

    const flow = firstBidEvent.trackingFlow;
    const bidWorkerId =
      firstBidEvent.actorUserId ||
      (firstBidEvent.metadata as any)?.workerId;

    // Authorization
    if (!user.isAdmin) {
      if (user.isWorker && bidWorkerId && bidWorkerId !== user.userId) {
        throw new ForbiddenException(
          'Bạn không có quyền xem lịch sử báo giá của thợ khác',
        );
      }
      if (user.isCustomer && flow.customerId && flow.customerId !== user.userId) {
        throw new ForbiddenException(
          'Bạn không có quyền xem báo giá của yêu cầu này',
        );
      }
    }

    const where: Prisma.TrackingEventWhereInput = {
      entityType: TrackingEntityType.bid,
      entityId: bidId,
    };

    return this.queryPaginatedTimeline(where, query);
  }

  /**
   * Retrieves the timeline for a specific order.
   */
  async getOrderTimeline(
    orderId: string,
    query: TimelineQueryDto,
    user: GatewayUser,
  ): Promise<TimelineListResponseDto> {
    const flow = await this.prisma.trackingFlow.findFirst({
      where: {
        OR: [
          { orderId },
          {
            events: {
              some: {
                entityType: TrackingEntityType.order,
                entityId: orderId,
              },
            },
          },
        ],
      },
    });

    if (!flow) {
      throw new NotFoundException(
        `Không tìm thấy tiến trình theo dõi cho đơn hàng: ${orderId}`,
      );
    }

    // Check customer authorization
    if (!user.isAdmin) {
      if (user.isCustomer && flow.customerId && flow.customerId !== user.userId) {
        throw new ForbiddenException(
          'Bạn không có quyền xem tiến trình của đơn hàng này',
        );
      }

      if (user.isWorker && !user.isCustomer) {
        const orderParticipation = await this.prisma.trackingEvent.findFirst({
          where: {
            trackingFlowId: flow.id,
            entityType: { in: [TrackingEntityType.order, TrackingEntityType.booking_proposal] },
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
            ],
          },
        });

        if (!orderParticipation) {
          throw new ForbiddenException(
            'Thợ không có quyền xem đơn hàng này do không phải người thực hiện',
          );
        }
      }
    }

    const where: Prisma.TrackingEventWhereInput = {
      trackingFlowId: flow.id,
      entityType: {
        in: [TrackingEntityType.order, TrackingEntityType.payment],
      },
    };

    return this.queryPaginatedTimeline(where, query);
  }

  // ==========================================================================
  // PAGINATION HELPER
  // ==========================================================================

  private async queryPaginatedTimeline(
    where: Prisma.TrackingEventWhereInput,
    query: TimelineQueryDto,
  ): Promise<TimelineListResponseDto> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, rawEvents] = await Promise.all([
      this.prisma.trackingEvent.count({ where }),
      this.prisma.trackingEvent.findMany({
        where,
        orderBy: [
          { occurredAt: sortOrder },
          { recordedAt: sortOrder },
          { id: sortOrder },
        ],
        skip,
        take: limit,
      }),
    ]);

    const items: TimelineEventItemDto[] = rawEvents.map((evt) => ({
      id: evt.id,
      eventId: evt.eventId,
      entityType: evt.entityType,
      entityId: evt.entityId,
      eventType: evt.eventType,
      sourceService: evt.sourceService,
      fromStatus: evt.fromStatus,
      toStatus: evt.toStatus,
      actorUserId: evt.actorUserId,
      reason: evt.reason,
      metadata: evt.metadata as Record<string, any> | null,
      occurredAt: evt.occurredAt,
      recordedAt: evt.recordedAt,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
