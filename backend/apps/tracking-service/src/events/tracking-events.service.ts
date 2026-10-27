import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { TrackingEntityType } from '@prisma/tracking-client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { EventEnvelope } from './dto/event-envelope.dto.js';

@Injectable()
export class TrackingEventsService {
  private readonly logger = new Logger(TrackingEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ingests any domain event into the tracking timeline.
   * Handles out-of-order arrival, idempotency deduplication, and flow linking.
   */
  async recordDomainEvent(
    data: EventEnvelope,
    forcedEventType?: string,
  ): Promise<{ recorded: boolean; reason?: string }> {
    const rawPayload = data.payload || data;
    const eventType =
      forcedEventType ||
      data.eventType ||
      rawPayload.eventType ||
      'unknown.event';

    const rawEventId =
      data.eventId ||
      data.id ||
      rawPayload.eventId ||
      rawPayload.id ||
      randomUUID();

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
      (eventType.startsWith('order.') && rawPayload.id ? rawPayload.id : undefined);

    let customerId: string | undefined =
      rawPayload.customerId ||
      rawPayload.customerUserId ||
      data.customerId ||
      (eventType.startsWith('service_request.') ? rawPayload.userId : undefined);

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
      }
    }

    if (!serviceRequestId) {
      this.logger.warn(
        `Event ${rawEventId} (${eventType}) dropped: neither serviceRequestId nor recognized orderId could be resolved.`,
      );
      return { recorded: false, reason: 'MISSING_SERVICE_REQUEST_ID' };
    }

    // 3. Resolve Entity Type, Entity ID and Source Service
    const entityType = this.resolveEntityType(eventType);
    const entityId = this.resolveEntityId(eventType, rawPayload, serviceRequestId, orderId);
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
      rawPayload.fromStatus ||
      rawPayload.previousStatus ||
      null;

    const toStatus =
      rawPayload.toStatus ||
      rawPayload.newStatus ||
      rawPayload.status ||
      null;

    const reason =
      rawPayload.reason ||
      rawPayload.message ||
      data.reason ||
      null;

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
      await this.prisma.$transaction(async (tx) => {
        // Record in consumed_events first for fast lock / dedupe
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

        // Insert append-only timeline event
        await tx.trackingEvent.create({
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
          },
        });
      });

      this.logger.log(
        `Recorded event ${eventType} (${rawEventId}) for flow ${serviceRequestId}`,
      );
      return { recorded: true };
    } catch (error: any) {
      // Prisma unique constraint violation (code P2002) -> idempotent duplicate
      if (error?.code === 'P2002') {
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
    if (eventType.startsWith('service_request.') || eventType.startsWith('booking_proposal.') || eventType.startsWith('order.')) {
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
      'validUntil',
      'matchCount',
      'title',
      'categoryId',
      'serviceCategoryId',
      'changesRequested',
      'targetDate',
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
