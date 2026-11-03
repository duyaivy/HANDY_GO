import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
  type MessageEvent,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  Observable,
  Subject,
  interval,
  merge,
  type Subscriber,
} from 'rxjs';
import { filter, map } from 'rxjs/operators';
import {
  TrackingEntityType,
  type TrackingEvent,
} from '@prisma/tracking-client';
import { RedisService } from '@app/redis';
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
  writeSequence?: number;
}

@Injectable()
export class TimelineStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimelineStreamService.name);
  private readonly eventSubject = new Subject<LiveTimelineEvent>();
  private static readonly REDIS_STREAM_CHANNEL = 'tracking:stream:events';
  private unsubscribeRedis?: () => Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.redis) {
      this.unsubscribeRedis = await this.redis.subscribe(
        TimelineStreamService.REDIS_STREAM_CHANNEL,
        (msg: string) => {
          try {
            const raw = JSON.parse(msg);
            const event: LiveTimelineEvent = {
              ...raw,
              occurredAt: new Date(raw.occurredAt),
              recordedAt: new Date(raw.recordedAt),
            };
            this.eventSubject.next(event);
          } catch (err: any) {
            this.logger.warn(`Failed to parse SSE event from Redis: ${err.message}`);
          }
        },
      );
      this.logger.log('Subscribed to Redis SSE stream channel');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.unsubscribeRedis) {
      await this.unsubscribeRedis().catch(() => {});
    }
  }

  /**
   * Broadcasts a newly recorded tracking event to all active SSE subscribers across replicas.
   */
  async broadcastEvent(event: LiveTimelineEvent): Promise<void> {
    this.logger.debug(
      `Broadcasting SSE event "${event.eventType}" for request ${event.serviceRequestId}`,
    );
    if (this.redis) {
      try {
        await this.redis.publish(TimelineStreamService.REDIS_STREAM_CHANNEL, event);
        return;
      } catch (err: any) {
        this.logger.warn(
          `Failed to publish SSE event to Redis (${err.message}). Falling back to local subject.`,
        );
      }
    }
    this.eventSubject.next(event);
  }

  /**
   * Generates a real-time SSE stream for a specific Service Request.
   * Enforces role-based security & bid shielding (TRK-04).
   */
  async getLiveStream(
    serviceRequestId: string,
    user: GatewayUser,
    lastEventId?: string,
  ): Promise<Observable<MessageEvent>> {
    const flow = await this.prisma.trackingFlow.findUnique({
      where: { serviceRequestId },
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
        isParticipatingWorker = Boolean(participation);
      }

      if (!isOwner && !isParticipatingWorker) {
        throw new ForbiddenException(
          'Bạn không có quyền đăng ký dòng sự kiện của yêu cầu này',
        );
      }
    }

    // Resolve assigned worker for the order to avoid leaking order/payment events to competitor/non-assigned workers
    let assignedWorkerId: string | null = null;
    if (user.isWorker && !user.isAdmin) {
      const orderCreatedEvent = await this.prisma.trackingEvent.findFirst({
        where: {
          trackingFlowId: flow.id,
          eventType: 'order.created',
        },
        select: { metadata: true },
      });
      const orderMeta = orderCreatedEvent?.metadata as any;
      assignedWorkerId =
        orderMeta?.workerUserId ||
        orderMeta?.workerId ||
        null;
    }

    const isEventAllowedForWorker = (evt: {
      entityType: TrackingEntityType;
      eventType: string;
      actorUserId?: string | null;
      metadata?: any;
    }): boolean => {
      if (!user.isWorker || user.isAdmin) return true;

      if (
        evt.entityType === TrackingEntityType.order &&
        evt.eventType === 'order.created'
      ) {
        const orderMeta = evt.metadata as any;
        assignedWorkerId =
          orderMeta?.workerUserId || orderMeta?.workerId || null;
      }

      if (evt.entityType === TrackingEntityType.bid) {
        const isMyBid =
          evt.actorUserId === user.userId ||
          (evt.metadata as any)?.workerId === user.userId ||
          (evt.metadata as any)?.workerUserId === user.userId;
        return Boolean(isMyBid);
      }
      if (evt.entityType === TrackingEntityType.booking_proposal) {
        const isMyProposal =
          evt.actorUserId === user.userId ||
          (evt.metadata as any)?.workerId === user.userId ||
          (evt.metadata as any)?.workerUserId === user.userId;
        return Boolean(isMyProposal);
      }
      if (
        evt.entityType === TrackingEntityType.order ||
        evt.entityType === TrackingEntityType.payment
      ) {
        return Boolean(assignedWorkerId && assignedWorkerId === user.userId);
      }
      return true;
    };

    const initialEvent: MessageEvent = {
      data: {
        type: 'connected',
        serviceRequestId,
        message: 'Đã kết nối theo dõi thời gian thực (SSE Live Stream)',
        timestamp: new Date().toISOString(),
      },
    };

    const toMessageEvent = (evt: LiveTimelineEvent): MessageEvent => ({
      id: evt.id,
      type: 'timeline_event',
      data: {
        type: 'timeline_event',
        payload: evt,
      },
    });

    const missedEvents: MessageEvent[] = [];
    const bufferedLiveEvents: LiveTimelineEvent[] = [];
    let bufferingLiveEvents = true;
    let streamSubscriber: Subscriber<MessageEvent> | undefined;
    let lastDeliveredSequence = 0;
    let drainingLiveEvents = false;

    if (!lastEventId) {
      const latestEvent = await this.prisma.trackingEvent.findFirst({
        where: { trackingFlowId: flow.id },
        orderBy: { writeSequence: 'desc' },
        select: { writeSequence: true },
      });
      lastDeliveredSequence = latestEvent?.writeSequence ?? 0;
    }

    const appendReplayEvents = (events: TrackingEvent[]): void => {
      for (const evt of events) {
        lastDeliveredSequence = evt.writeSequence;
        if (!isEventAllowedForWorker(evt)) {
          continue;
        }
        missedEvents.push({
          id: evt.id,
          type: 'timeline_event',
          data: {
            type: 'timeline_event',
            payload: {
              serviceRequestId,
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
            },
          },
        });
      }
    };

    const drainLiveEvents = async (): Promise<void> => {
      if (bufferingLiveEvents || drainingLiveEvents || !streamSubscriber) {
        return;
      }

      drainingLiveEvents = true;
      try {
        while (bufferedLiveEvents.length > 0 && streamSubscriber && !streamSubscriber.closed) {
          const pendingSignals = bufferedLiveEvents.splice(0);
          for (const event of pendingSignals) {
            if (
              event.writeSequence === undefined &&
              isEventAllowedForWorker(event)
            ) {
              streamSubscriber.next(toMessageEvent(event));
            }
          }

          if (pendingSignals.some((event) => event.writeSequence !== undefined)) {
            const committedEvents =
              (await this.prisma.trackingEvent.findMany({
                where: {
                  trackingFlowId: flow.id,
                  writeSequence: { gt: lastDeliveredSequence },
                },
                orderBy: { writeSequence: 'asc' },
              })) ?? [];

            for (const event of committedEvents) {
              if (!streamSubscriber || streamSubscriber.closed) {
                break;
              }
              lastDeliveredSequence = event.writeSequence;
              if (isEventAllowedForWorker(event)) {
                streamSubscriber.next(
                  toMessageEvent({
                    serviceRequestId,
                    id: event.id,
                    eventId: event.eventId,
                    entityType: event.entityType,
                    entityId: event.entityId,
                    eventType: event.eventType,
                    sourceService: event.sourceService,
                    fromStatus: event.fromStatus,
                    toStatus: event.toStatus,
                    actorUserId: event.actorUserId,
                    reason: event.reason,
                    metadata: event.metadata as Record<string, any> | null,
                    occurredAt: event.occurredAt,
                    recordedAt: event.recordedAt,
                    writeSequence: event.writeSequence,
                  }),
                );
              }
            }
          }
        }
      } catch (error) {
        bufferedLiveEvents.length = 0;
        this.logger.error(
          `Failed to replay live tracking events for ${serviceRequestId}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        streamSubscriber?.error(error);
      } finally {
        drainingLiveEvents = false;
        if (bufferedLiveEvents.length > 0 && streamSubscriber && !streamSubscriber.closed) {
          void drainLiveEvents();
        }
      }
    };

    const liveSubscription = this.eventSubject
      .asObservable()
      .pipe(filter((evt) => evt.serviceRequestId === serviceRequestId))
      .subscribe((evt) => {
        bufferedLiveEvents.push(evt);
        void drainLiveEvents();
      });

    if (lastEventId) {
      try {
        const baseEvent = await this.prisma.trackingEvent.findFirst({
          where: {
            trackingFlowId: flow.id,
            OR: [{ id: lastEventId }, { eventId: lastEventId }],
          },
        });

        if (baseEvent) {
          lastDeliveredSequence = baseEvent.writeSequence;
          const missedDbEvents = await this.prisma.trackingEvent.findMany({
            where: {
              trackingFlowId: flow.id,
              writeSequence: { gt: baseEvent.writeSequence },
            },
            orderBy: { writeSequence: 'asc' },
          });

          appendReplayEvents(missedDbEvents);
        } else {
          const events = await this.prisma.trackingEvent.findMany({
            where: { trackingFlowId: flow.id },
            orderBy: { writeSequence: 'asc' },
          });
          appendReplayEvents(events);
        }
      } catch (error) {
        liveSubscription.unsubscribe();
        throw error;
      }
    } else {
      try {
        const eventsDuringRegistration = await this.prisma.trackingEvent.findMany({
          where: {
            trackingFlowId: flow.id,
            writeSequence: { gt: lastDeliveredSequence },
          },
          orderBy: { writeSequence: 'asc' },
        });
        appendReplayEvents(eventsDuringRegistration);
      } catch (error) {
        liveSubscription.unsubscribe();
        throw error;
      }
    }

    const replayAndLive$ = new Observable<MessageEvent>((subscriber) => {
      streamSubscriber = subscriber;
      subscriber.next(initialEvent);
      for (const event of missedEvents) {
        subscriber.next(event);
      }

      bufferingLiveEvents = false;
      void drainLiveEvents();

      return () => {
        streamSubscriber = undefined;
        liveSubscription.unsubscribe();
      };
    });

    const heartbeat$ = interval(25000).pipe(
      map((): MessageEvent => ({
        data: {
          type: 'ping',
          timestamp: new Date().toISOString(),
        },
      })),
    );

    return merge(replayAndLive$, heartbeat$);
  }
}
