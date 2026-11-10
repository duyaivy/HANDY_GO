import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { TrackingEntityType } from '@prisma/tracking-client';
import { RedisService } from '@app/redis';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TimelineStreamService } from '../common/stream/timeline-stream.service.js';
import type { EventEnvelope } from './dto/event-envelope.dto.js';

export interface FlushPendingOrderResult {
  status: 'completed' | 'lock_busy' | 'failed';
  flushedCount: number;
  remainingCount?: number;
  error?: string;
}

@Injectable()
export class TrackingEventsService {
  private readonly logger = new Logger(TrackingEventsService.name);

  static readonly MAX_PENDING_AGE_ALERT_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly streamService?: TimelineStreamService,
  ) {}

  /**
   * Ingests any domain event into the tracking timeline.
   * Handles out-of-order arrival, idempotency deduplication, and flow linking.
   */
  async recordDomainEvent(
    data: EventEnvelope,
    forcedEventType?: string,
    isFlushing = false,
  ): Promise<{ recorded: boolean; reason?: string }> {
    const rawPayload = data.payload || data;
    const eventType =
      forcedEventType ||
      data.eventType ||
      rawPayload.eventType ||
      'unknown.event';

    const rawEventId =
      data.eventId || data.id || rawPayload.eventId || rawPayload.id;
    if (!rawEventId || String(rawEventId).length > 128) {
      throw new Error('INVALID_EVENT_ID: a stable event ID is required');
    }

    // Ensure database UUID compatibility for event_id
    const dbEventId = isUUID(rawEventId) ? rawEventId : randomUUID();

    // 1. Idempotency Check via consumed_events
    const alreadyConsumed = await this.prisma.consumedEvent.findUnique({
      where: { eventId: String(rawEventId) },
    });
    if (alreadyConsumed) {
      this.logger.debug(
        `Event ${rawEventId} (${eventType}) was already consumed. Skipping.`,
      );
      return { recorded: false, reason: 'ALREADY_CONSUMED' };
    }

    // 2. Resolve Service Request ID and Order ID
    let serviceRequestId: string | undefined =
      data.serviceRequestId ||
      rawPayload.serviceRequestId ||
      data.requestId ||
      rawPayload.requestId;

    let orderId: string | undefined =
      data.orderId ||
      rawPayload.orderId ||
      (data.aggregateType === 'order' && data.aggregateId
        ? data.aggregateId
        : undefined) ||
      (rawPayload.aggregateType === 'order' && rawPayload.aggregateId
        ? rawPayload.aggregateId
        : undefined) ||
      (rawPayload.order?.id ? rawPayload.order.id : undefined) ||
      (rawPayload.payment?.orderId ? rawPayload.payment.orderId : undefined) ||
      (eventType.startsWith('order.') && rawPayload.id
        ? rawPayload.id
        : undefined);

    let customerId: string | undefined =
      rawPayload.customerId ||
      rawPayload.customerUserId ||
      data.customerId ||
      (eventType.startsWith('service_request.')
        ? rawPayload.userId
        : undefined);

    if (customerId && !isUUID(customerId)) {
      customerId = undefined;
    }

    if (orderId && !isUUID(orderId)) {
      orderId = undefined;
    }

    // If serviceRequestId is missing, try to resolve via orderId
    if (!serviceRequestId && orderId) {
      const existingFlowByOrder = await this.prisma.trackingFlow.findUnique({
        where: { orderId },
      });
      if (existingFlowByOrder) {
        serviceRequestId = existingFlowByOrder.serviceRequestId;
      } else {
        // Serialize buffering and consumption of the same ID across replicas.
        // ACK is only possible after this transaction commits.
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${String(rawEventId)}, 0))::text`;
          if (
            await tx.consumedEvent.findUnique({
              where: { eventId: String(rawEventId) },
            })
          )
            return;
          await tx.pendingTrackingEvent.upsert({
            where: { eventId: String(rawEventId) },
            create: {
              eventId: String(rawEventId),
              orderId: orderId!,
              eventType,
              envelope: JSON.parse(JSON.stringify(data)),
            },
            update: {},
          });
        });
        const linked = await this.prisma.trackingFlow.findUnique({
          where: { orderId },
        });
        if (linked)
          await this.flushPendingOrderEvents(orderId, linked.serviceRequestId);
        return { recorded: false, reason: 'BUFFERED_PENDING_ORDER_CREATED' };
      }
    }

    if (!serviceRequestId) {
      this.logger.warn(
        `Event ${rawEventId} (${eventType}) dropped as invalid payload: neither serviceRequestId nor recognized orderId could be resolved.`,
      );
      return { recorded: false, reason: 'INVALID_PAYLOAD_UNRESOLVABLE_FLOW' };
    }

    // 3. Resolve Entity Type, Entity ID and Source Service
    const entityType = this.resolveEntityType(eventType);
    const entityId = this.resolveEntityId(
      eventType,
      rawPayload,
      serviceRequestId,
      orderId,
    );
    const sourceService =
      data.sourceService ||
      rawPayload.sourceService ||
      this.resolveSourceService(eventType);

    // 4. Resolve Actor, Status transitions, and Reason
    const rawActorId =
      data.actorUserId ||
      rawPayload.actorUserId ||
      rawPayload.workerId ||
      rawPayload.customerId ||
      rawPayload.userId;
    const actorUserId = rawActorId && isUUID(rawActorId) ? rawActorId : null;

    const fromStatus =
      rawPayload.fromStatus || rawPayload.previousStatus || null;

    const toStatus =
      rawPayload.toStatus ||
      rawPayload.newStatus ||
      rawPayload.nextStatus ||
      rawPayload.status ||
      null;

    const reason =
      rawPayload.reason || rawPayload.message || data.reason || null;

    const aggregateVersion =
      typeof data.aggregateVersion === 'number'
        ? data.aggregateVersion
        : typeof rawPayload.aggregateVersion === 'number'
          ? rawPayload.aggregateVersion
          : null;

    const occurredAt = data.occurredAt
      ? new Date(data.occurredAt)
      : rawPayload.occurredAt
        ? new Date(rawPayload.occurredAt)
        : new Date();

    // 5. Sanitize Metadata (avoid storing sensitive secrets or duplicate large payloads)
    const metadata = this.sanitizeMetadata(rawPayload, {
      rawEventId: rawEventId !== dbEventId ? rawEventId : undefined,
    });

    // 6. Transactional Append & Flow Linking
    try {
      let createdRecord: any = null;

      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${String(rawEventId)}, 0))::text`;
        if (
          await tx.consumedEvent.findUnique({
            where: { eventId: String(rawEventId) },
          })
        ) {
          await tx.pendingTrackingEvent.deleteMany({
            where: { eventId: String(rawEventId) },
          });
          return;
        }
        // Consumption, timeline write and pending deletion commit together.
        await tx.consumedEvent.create({
          data: {
            eventId: String(rawEventId),
            eventType,
            consumedAt: new Date(),
          },
        });

        // Upsert tracking_flow (supports out-of-order events where bid/proposal/order arrives first)
        const flow = await tx.trackingFlow.upsert({
          where: { serviceRequestId },
          create: {
            serviceRequestId,
            orderId: orderId ?? null,
            customerId: customerId ?? null,
          },
          update: {
            // Update orderId if newly available
            ...(orderId ? { orderId } : {}),
            // Update customerId if newly available
            ...(customerId ? { customerId } : {}),
          },
        });
        const updatedFlow = await tx.trackingFlow.update({
          where: { id: flow.id },
          data: { eventSequence: { increment: 1 } },
          select: { eventSequence: true },
        });

        // Insert append-only timeline event
        createdRecord = await tx.trackingEvent.create({
          data: {
            id: randomUUID(),
            trackingFlowId: flow.id,
            eventId: dbEventId,
            entityType,
            entityId,
            eventType,
            sourceService,
            aggregateVersion,
            fromStatus: fromStatus ? String(fromStatus).slice(0, 50) : null,
            toStatus: toStatus ? String(toStatus).slice(0, 50) : null,
            actorUserId,
            reason: reason ? String(reason) : null,
            metadata,
            occurredAt,
            writeSequence: updatedFlow.eventSequence,
          },
        });
        await tx.pendingTrackingEvent.deleteMany({
          where: { eventId: String(rawEventId) },
        });
      });

      this.logger.log(
        `Recorded event ${eventType} (${rawEventId}) for flow ${serviceRequestId}`,
      );

      // Invalidate active cache keys for this serviceRequestId
      if (this.redis && serviceRequestId) {
        await this.redis.delByPattern(`tracking:*:${serviceRequestId}:*`);
      }

      // Broadcast real-time event to SSE subscribers
      if (this.streamService && createdRecord) {
        await this.streamService.broadcastEvent({
          serviceRequestId,
          id: createdRecord.id,
          eventId: createdRecord.eventId,
          entityType: createdRecord.entityType,
          entityId: createdRecord.entityId,
          eventType: createdRecord.eventType,
          sourceService: createdRecord.sourceService,
          fromStatus: createdRecord.fromStatus,
          toStatus: createdRecord.toStatus,
          actorUserId: createdRecord.actorUserId,
          reason: createdRecord.reason,
          metadata: createdRecord.metadata as Record<string, any> | null,
          occurredAt: createdRecord.occurredAt,
          recordedAt: createdRecord.recordedAt,
          writeSequence: createdRecord.writeSequence,
        });
      }

      // If this event linked an orderId and we are not currently flushing, flush any buffered events
      if (!isFlushing && orderId) {
        await this.flushPendingOrderEvents(orderId, serviceRequestId);
      }

      return { recorded: true };
    } catch (error: any) {
      // Prisma unique constraint violation (code P2002) -> idempotent duplicate
      if (
        error?.code === 'P2002' &&
        (await this.prisma.consumedEvent.findUnique({
          where: { eventId: String(rawEventId) },
        }))
      ) {
        this.logger.warn(
          `Duplicate event ${rawEventId} caught via database constraint. Treating as consumed.`,
        );
        return { recorded: false, reason: 'IDEMPOTENT_DUPLICATE' };
      }
      this.logger.error(
        `Failed to record event ${eventType} (${rawEventId}): ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async flushPendingOrderEvents(
    orderId: string,
    serviceRequestId: string,
  ): Promise<FlushPendingOrderResult> {
    const pending = await this.prisma.pendingTrackingEvent.findMany({
      where: { orderId, nextAttemptAt: { lte: new Date() } },
      orderBy: [{ receivedAt: 'asc' }, { eventId: 'asc' }],
      take: 100,
    });
    let flushedCount = 0;
    let failed = false;
    for (const event of pending) {
      try {
        const original = event.envelope as unknown as EventEnvelope;
        const result = await this.recordDomainEvent(
          {
            ...original,
            eventId: event.eventId,
            serviceRequestId,
            orderId,
          },
          event.eventType,
          true,
        );
        if (
          !result.recorded &&
          result.reason !== 'ALREADY_CONSUMED' &&
          result.reason !== 'IDEMPOTENT_DUPLICATE'
        ) {
          throw new Error(`Pending event rejected: ${result.reason}`);
        }
        // A prior successful delivery may have committed before this pending scan.
        if (!result.recorded)
          await this.prisma.pendingTrackingEvent.deleteMany({
            where: { eventId: event.eventId },
          });
        flushedCount++;
      } catch (error: any) {
        failed = true;
        // Retain poison messages as well as transient failures for operator recovery.
        await this.prisma.pendingTrackingEvent.updateMany({
          where: { eventId: event.eventId },
          data: {
            attempts: { increment: 1 },
            lastError: String(error.message).slice(0, 1000),
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(300_000, 1000 * 2 ** Math.min(event.attempts, 8)),
            ),
          },
        });
        this.logger.warn(
          `Pending event ${event.eventId} retained for retry: ${error.message}`,
        );
      }
    }
    return { status: failed ? 'failed' : 'completed', flushedCount };
  }

  async reconcilePendingOrders(
    maxAgeAlertMs = TrackingEventsService.MAX_PENDING_AGE_ALERT_MS,
  ): Promise<{
    scanned: number;
    flushedOrders: number;
    stalledOrders: number;
  }> {
    // Visit a bounded, rotating batch: unresolved orders cannot starve ready ones.
    const events = await this.prisma.pendingTrackingEvent.findMany({
      where: { nextAttemptAt: { lte: new Date() } },
      orderBy: [{ nextAttemptAt: 'asc' }, { eventId: 'asc' }],
      take: 100,
    });
    let flushedOrders = 0;
    let stalledOrders = 0;
    const orders = new Set(events.map((event) => event.orderId));
    for (const orderId of orders) {
      const flow = await this.prisma.trackingFlow.findUnique({
        where: { orderId },
      });
      if (flow) {
        const result = await this.flushPendingOrderEvents(
          orderId,
          flow.serviceRequestId,
        );
        if (result.flushedCount) flushedOrders++;
      } else {
        const ids = events
          .filter((event) => event.orderId === orderId)
          .map((event) => event.eventId);
        await this.prisma.pendingTrackingEvent.updateMany({
          where: { eventId: { in: ids } },
          data: { nextAttemptAt: new Date(Date.now() + 15_000) },
        });
        if (
          events.some(
            (event) =>
              event.orderId === orderId &&
              Date.now() - event.receivedAt.getTime() > maxAgeAlertMs,
          )
        ) {
          stalledOrders++;
          this.logger.warn(
            `[PENDING_ORDER_STALLED_ALERT] Order ${orderId} is awaiting its flow`,
          );
        }
      }
    }
    return { scanned: events.length, flushedOrders, stalledOrders };
  }

  private resolveEntityType(eventType: string): TrackingEntityType {
    if (eventType.startsWith('service_request.')) {
      return TrackingEntityType.service_request;
    }
    if (eventType.startsWith('matching.')) {
      return TrackingEntityType.matching;
    }
    if (eventType.startsWith('bidding.round.')) {
      return TrackingEntityType.bidding_round;
    }
    if (eventType.startsWith('bid.')) {
      return TrackingEntityType.bid;
    }
    if (eventType.startsWith('booking_proposal.')) {
      return TrackingEntityType.booking_proposal;
    }
    if (eventType.startsWith('order.')) {
      return TrackingEntityType.order;
    }
    if (eventType.startsWith('payment.')) {
      return TrackingEntityType.payment;
    }
    return TrackingEntityType.service_request;
  }

  private resolveEntityId(
    eventType: string,
    payload: any,
    serviceRequestId: string,
    orderId?: string,
  ): string {
    let candidate: string | undefined;

    if (eventType.startsWith('bid.')) {
      candidate = payload.bidId || payload.id;
    } else if (eventType.startsWith('bidding.round.')) {
      candidate = payload.roundId || payload.biddingRoundId || payload.id;
    } else if (eventType.startsWith('booking_proposal.')) {
      candidate = payload.proposalId || payload.id;
    } else if (eventType.startsWith('matching.')) {
      candidate = payload.matchRunId || payload.id;
    } else if (eventType.startsWith('order.')) {
      candidate = orderId || payload.orderId || payload.id;
    } else if (eventType.startsWith('payment.')) {
      candidate = payload.paymentId || payload.id || orderId;
    } else if (eventType.startsWith('service_request.')) {
      candidate = serviceRequestId;
    }

    if (candidate && isUUID(candidate)) {
      return candidate;
    }
    return serviceRequestId;
  }

  private resolveSourceService(eventType: string): string {
    if (
      eventType.startsWith('service_request.') ||
      eventType.startsWith('booking_proposal.') ||
      eventType.startsWith('order.')
    ) {
      return 'order-service';
    }
    if (eventType.startsWith('bidding.') || eventType.startsWith('bid.')) {
      return 'bidding-service';
    }
    if (eventType.startsWith('matching.')) {
      return 'matching-service';
    }
    if (eventType.startsWith('payment.')) {
      return 'payment-service';
    }
    return 'order-service';
  }

  private sanitizeMetadata(
    payload: any,
    extra: Record<string, any> = {},
  ): Record<string, any> {
    if (!payload || typeof payload !== 'object') {
      return extra;
    }

    const sanitized: Record<string, any> = { ...extra };

    // Whitelist informative business metadata fields
    const safeKeys = [
      'amount',
      'price',
      'totalAmount',
      'workerId',
      'customerId',
      'revisionNo',
      'roundId',
      'bidCount',
      'selectedBidId',
      'selectionSource',
      'durationHours',
      'opensAt',
      'closesAt',
      'biddingClosedAt',
      'validUntil',
      'matchCount',
      'title',
      'categoryId',
      'serviceCategoryId',
      'changesRequested',
      'targetDate',
      'reworkReason',
      'disputeReason',
      'resolution',
      'resolutionNote',
      'reason',
      'reworkRequestedAt',
      'disputedAt',
      'resolvedAt',
      'finishedAt',
      'confirmedAt',
      'startedAt',
      'notificationKind',
      'previousStatus',
      'nextStatus',
    ];

    for (const key of safeKeys) {
      if (payload[key] !== undefined) {
        sanitized[key] = payload[key];
      }
    }

    // Capture match results count if matching event
    if (Array.isArray(payload.recommendations)) {
      sanitized.matchCount = payload.recommendations.length;
    } else if (Array.isArray(payload.results)) {
      sanitized.matchCount = payload.results.length;
    }

    return sanitized;
  }
}
