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
  private readonly activeStreamDrainers = new Set<() => Promise<void>>();

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
        () => {
          this.logger.log(
            'Redis subscriber reconnected. Triggering catch-up drain on all active SSE streams.',
          );
          void this.drainAllActiveStreams();
        },
      );
      this.logger.log('Subscribed to Redis SSE stream channel');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.unsubscribeRedis) {
      await Promise.resolve(this.unsubscribeRedis()).catch(() => {});
    }
  }

  /**
   * Triggers a catch-up drain on all currently active SSE streams on this replica instance.
   * Useful when Redis reconnects after a network partition or outage.
   */
  async drainAllActiveStreams(): Promise<void> {
    if (this.activeStreamDrainers.size === 0) return;
    this.logger.debug(
      `Draining all active SSE streams (${this.activeStreamDrainers.size} active)`,
    );
    const drains = Array.from(this.activeStreamDrainers).map((drain) =>
      drain().catch((err) => {
        this.logger.warn(`Error during active stream drain: ${err?.message}`);
      }),
    );
    await Promise.all(drains);
  }

  /**
   * Broadcasts a newly recorded tracking event to all active SSE subscribers across replicas.
   * Uses Redis Pub/Sub (publishStrict) to alert all replicas.
   * In case of Redis outage or publish failure, logs a warning and notifies local subscribers.
   * Remote replicas will automatically recover the event from PostgreSQL via periodic sync or reconnect drain.
   */
  async broadcastEvent(event: LiveTimelineEvent): Promise<void> {
    this.logger.debug(
      `Broadcasting SSE event "${event.eventType}" for request ${event.serviceRequestId}`,
    );
    if (this.redis) {
      try {
        await this.redis.publishStrict(TimelineStreamService.REDIS_STREAM_CHANNEL, event);
        return;
      } catch (err: any) {
        this.logger.warn(
          `Failed to publish SSE event to Redis (${err.message}). Falling back to local subject. Other replicas will catch up via periodic DB sync or reconnect drain.`,
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
    let isDraining = false;
    let hasPendingWork = false;

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
              writeSequence: evt.writeSequence,
            },
          },
        });
      }
    };

    const drainLiveEvents = async (): Promise<void> => {
      if (bufferingLiveEvents || !streamSubscriber || streamSubscriber.closed) {
        return;
      }

      if (isDraining) {
        hasPendingWork = true;
        return;
      }

      isDraining = true;
      try {
        do {
          hasPendingWork = false;
          bufferedLiveEvents.length = 0;

          if (!streamSubscriber || streamSubscriber.closed) {
            break;
          }

          const committedEvents = await this.prisma.trackingEvent.findMany({
            where: {
              trackingFlowId: flow.id,
              writeSequence: { gt: lastDeliveredSequence },
            },
            orderBy: { writeSequence: 'asc' },
          });

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
        } while (
          (hasPendingWork || bufferedLiveEvents.length > 0) &&
          streamSubscriber &&
          !streamSubscriber.closed
        );
      } catch (error) {
        this.logger.error(
          `Failed to replay live tracking events for ${serviceRequestId}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        streamSubscriber?.error(error);
      } finally {
        isDraining = false;
        if (
          (hasPendingWork || bufferedLiveEvents.length > 0) &&
          streamSubscriber &&
          !streamSubscriber.closed
        ) {
          void drainLiveEvents();
        }
      }
    };

    // 1. Subscribe to live stream before queries to ensure zero events are missed
    const liveSubscription = this.eventSubject
      .asObservable()
      .pipe(filter((evt) => evt.serviceRequestId === serviceRequestId))
      .subscribe((evt) => {
        bufferedLiveEvents.push(evt);
        void drainLiveEvents();
      });

    try {
      if (lastEventId) {
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
      } else {
        const latestEvent = await this.prisma.trackingEvent.findFirst({
          where: { trackingFlowId: flow.id },
          orderBy: { writeSequence: 'desc' },
          select: { writeSequence: true },
        });
        lastDeliveredSequence = latestEvent?.writeSequence ?? 0;

        const eventsDuringRegistration = await this.prisma.trackingEvent.findMany({
          where: {
            trackingFlowId: flow.id,
            writeSequence: { gt: lastDeliveredSequence },
          },
          orderBy: { writeSequence: 'asc' },
        });
        appendReplayEvents(eventsDuringRegistration);
      }
    } catch (error) {
      liveSubscription.unsubscribe();
      throw error;
    }

    const replayAndLive$ = new Observable<MessageEvent>((subscriber) => {
      streamSubscriber = subscriber;
      this.activeStreamDrainers.add(drainLiveEvents);

      subscriber.next(initialEvent);
      for (const event of missedEvents) {
        subscriber.next(event);
      }

      bufferingLiveEvents = false;
      void drainLiveEvents();

      return () => {
        this.activeStreamDrainers.delete(drainLiveEvents);
        streamSubscriber = undefined;
        liveSubscription.unsubscribe();
      };
    });

    // Periodic sync interval (every 5 seconds) to catch up on any missed events if Pub/Sub signals are lost or Redis fails
    const periodicSync$ = interval(5000).pipe(
      map((): MessageEvent | null => {
        void drainLiveEvents();
        return null;
      }),
      filter((msg): msg is MessageEvent => msg !== null),
    );

    // Periodic heartbeat (ping) that also triggers drainLiveEvents to catch any missed Pub/Sub signals
    const heartbeat$ = interval(25000).pipe(
      map((): MessageEvent => {
        void drainLiveEvents();
        return {
          data: {
            type: 'ping',
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );

    return merge(replayAndLive$, heartbeat$, periodicSync$);
  }
}
