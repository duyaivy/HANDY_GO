import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  type MessageEvent,
} from '@nestjs/common';
import { Observable, Subject, interval, merge, of } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { TrackingEntityType } from '@prisma/tracking-client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { GatewayUser } from '../security/tracking-security.util.js';

export interface LiveTimelineEvent {
  serviceRequestId: string;
  id: string;
  eventId: string;
  entityType: TrackingEntityType;
  entityId: string;
  eventType: string;
  sourceService: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
  occurredAt: Date;
  recordedAt: Date;
}

@Injectable()
export class TimelineStreamService {
  private readonly logger = new Logger(TimelineStreamService.name);
  private readonly eventSubject = new Subject<LiveTimelineEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Broadcasts a newly recorded tracking event to all active SSE subscribers.
   */
  broadcastEvent(event: LiveTimelineEvent): void {
    this.logger.debug(
      `Broadcasting SSE event "${event.eventType}" for request ${event.serviceRequestId}`,
    );
    this.eventSubject.next(event);
  }

  /**
   * Generates a real-time SSE stream for a specific Service Request.
   * Enforces role-based security & bid shielding (TRK-04).
   */
  async getLiveStream(
    serviceRequestId: string,
    user: GatewayUser,
  ): Promise<Observable<MessageEvent>> {
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
          'Bạn không có quyền đăng ký dòng sự kiện của yêu cầu này',
        );
      }

      if (user.isWorker && !user.isCustomer) {
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
            'Thợ không có quyền xem sự kiện trực tiếp của yêu cầu này do chưa tham gia',
          );
        }
      }
    }

    // 1. Initial connection message
    const initial$ = of<MessageEvent>({
      data: {
        type: 'connected',
        serviceRequestId,
        message: 'Đã kết nối theo dõi thời gian thực (SSE Live Stream)',
        timestamp: new Date().toISOString(),
      },
    });

    // 2. Keep-alive heartbeat ping every 25 seconds
    const heartbeat$ = interval(25000).pipe(
      map((): MessageEvent => ({
        data: {
          type: 'ping',
          timestamp: new Date().toISOString(),
        },
      })),
    );

    // 3. Filtered event stream with bid shielding
    const events$ = this.eventSubject.asObservable().pipe(
      filter((evt) => evt.serviceRequestId === serviceRequestId),
      filter((evt) => {
        // Bid shielding for Worker: hide competitor bids and proposals
        if (user.isWorker && !user.isAdmin) {
          if (evt.entityType === TrackingEntityType.bid) {
            const isMyBid =
              evt.actorUserId === user.userId ||
              (evt.metadata as any)?.workerId === user.userId;
            return Boolean(isMyBid);
          }
          if (evt.entityType === TrackingEntityType.booking_proposal) {
            const isMyProposal =
              evt.actorUserId === user.userId ||
              (evt.metadata as any)?.workerId === user.userId;
            return Boolean(isMyProposal);
          }
        }
        return true;
      }),
      map((evt): MessageEvent => ({
        data: {
          type: 'timeline_event',
          payload: evt,
        },
      })),
    );

    return merge(initial$, heartbeat$, events$);
  }
}
