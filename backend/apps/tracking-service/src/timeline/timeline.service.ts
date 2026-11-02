import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma, TrackingEntityType } from '@prisma/tracking-client';
import { RedisService } from '@app/redis';
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
  private static readonly IMMUTABLE_TTL_SECONDS = 7 * 24 * 3600; // 7 ngày

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Retrieves the combined timeline of a Service Request flow.
   * Enforces role-based visibility rules (TRK-03 & TRK-04).
   * Caches completed / cancelled flows in Redis for fast retrieval.
   */
  async getRequestTimeline(
    serviceRequestId: string,
    query: TimelineQueryDto,
    user: GatewayUser,
  ): Promise<TimelineListResponseDto> {
    const cacheKey = this.buildTimelineCacheKey(serviceRequestId, user, query);
    if (this.redis) {
      const cached = await this.redis.get<TimelineListResponseDto>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for timeline: ${cacheKey}`);
        return cached;
      }
    }

    const flow = await this.prisma.trackingFlow.findUnique({
      where: { serviceRequestId },
    });

    if (!flow) {
      throw new NotFoundException(
        `Không tìm thấy tiến trình theo dõi cho yêu cầu: ${serviceRequestId}`,
      );
    }

    // Role-based authorization: fail-closed if ownership cannot be confirmed
    if (!user.isAdmin) {
      if (user.isCustomer) {
        if (!flow.customerId || flow.customerId !== user.userId) {
          throw new ForbiddenException(
            'Bạn không có quyền truy cập tiến trình của yêu cầu này',
          );
        }
      } else if (user.isWorker) {
        // Verify worker has participated in this request
        const participation = await this.prisma.trackingEvent.findFirst({
          where: {
            trackingFlowId: flow.id,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
              { metadata: { path: ['workerUserId'], equals: user.userId } },
            ],
          },
        });

        if (!participation) {
          throw new ForbiddenException(
            'Thợ không có quyền truy cập tiến trình của yêu cầu này do chưa tham gia',
          );
        }
      } else {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập tiến trình của yêu cầu này',
        );
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
              { metadata: { path: ['workerUserId'], equals: user.userId } },
            ],
          },
          {
            entityType: TrackingEntityType.booking_proposal,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
              { metadata: { path: ['workerUserId'], equals: user.userId } },
            ],
          },
          {
            entityType: TrackingEntityType.order,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
              { metadata: { path: ['workerUserId'], equals: user.userId } },
            ],
          },
          {
            entityType: TrackingEntityType.payment,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
              { metadata: { path: ['workerUserId'], equals: user.userId } },
            ],
          },
        ],
      });
    }

    const where: Prisma.TrackingEventWhereInput = { AND: whereConditions };

    const result = await this.queryPaginatedTimeline(where, query);

    const isImmutable = await this.isFlowImmutable(flow.id);
    if (isImmutable && this.redis) {
      await this.redis.set(cacheKey, result, TimelineService.IMMUTABLE_TTL_SECONDS);
      this.logger.debug(
        `Cached immutable timeline for ${cacheKey} (TTL: ${TimelineService.IMMUTABLE_TTL_SECONDS}s)`,
      );
    }

    return result;
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

    // Authorization: fail-closed
    if (!user.isAdmin) {
      if (user.isWorker) {
        if (!bidWorkerId || bidWorkerId !== user.userId) {
          throw new ForbiddenException(
            'Bạn không có quyền xem lịch sử báo giá của thợ khác',
          );
        }
      } else if (user.isCustomer) {
        if (!flow.customerId || flow.customerId !== user.userId) {
          throw new ForbiddenException(
            'Bạn không có quyền xem báo giá của yêu cầu này',
          );
        }
      } else {
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

    // Check authorization: fail-closed
    if (!user.isAdmin) {
      if (user.isCustomer) {
        if (!flow.customerId || flow.customerId !== user.userId) {
          throw new ForbiddenException(
            'Bạn không có quyền xem tiến trình của đơn hàng này',
          );
        }
      } else if (user.isWorker) {
        // Worker must specifically be assigned to this order (not just any past proposal in the flow)
        const orderParticipation = await this.prisma.trackingEvent.findFirst({
          where: {
            trackingFlowId: flow.id,
            entityType: TrackingEntityType.order,
            entityId: orderId,
            OR: [
              { actorUserId: user.userId },
              { metadata: { path: ['workerId'], equals: user.userId } },
              { metadata: { path: ['workerUserId'], equals: user.userId } },
            ],
          },
        });

        if (!orderParticipation) {
          throw new ForbiddenException(
            'Thợ không có quyền xem đơn hàng này do không phải người thực hiện',
          );
        }
      } else {
        throw new ForbiddenException(
          'Bạn không có quyền xem tiến trình của đơn hàng này',
        );
      }
    }

    const where: Prisma.TrackingEventWhereInput = {
      trackingFlowId: flow.id,
      OR: [
        {
          entityType: TrackingEntityType.order,
          entityId: orderId,
        },
        {
          entityType: TrackingEntityType.payment,
          OR: [
            { entityId: orderId },
            { metadata: { path: ['orderId'], equals: orderId } },
          ],
        },
      ],
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

  private buildTimelineCacheKey(
    serviceRequestId: string,
    user: GatewayUser,
    query: TimelineQueryDto,
  ): string {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const sort = query.sortOrder === 'desc' ? 'desc' : 'asc';
    const type = query.entityType || 'all';

    let userScope = 'admin';
    if (user.isCustomer) {
      userScope = `cust:${user.userId}`;
    } else if (user.isWorker) {
      userScope = `wrk:${user.userId}`;
    }
    return `tracking:timeline:${serviceRequestId}:${userScope}:p${page}:l${limit}:s${sort}:t${type}`;
  }

  private async isFlowImmutable(trackingFlowId: string): Promise<boolean> {
    const terminalEvent = await this.prisma.trackingEvent.findFirst({
      where: {
        trackingFlowId,
        eventType: {
          in: [
            'order.completed',
            'order.cancelled',
            'service_request.cancelled',
            'service_request.expired',
          ],
        },
      },
      select: { id: true },
    });
    return Boolean(terminalEvent);
  }
}
