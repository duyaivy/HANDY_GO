import { MatchRunBusyError } from '../persistence/match-run.repository.js';
import { createHash } from 'node:crypto';
import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS, type DomainEvent } from '@app/common';
import { ConsumedEventRepository } from '../persistence/consumed-event.repository.js';
import { ServiceRequestProjectionService } from '../projections/service-request-projection.service.js';
import { MatchingJobQueueService } from '../queue/matching-job-queue.service.js';
import type {
  ServiceRequestCancelledEventData,
  ServiceRequestConvertedToOrderEventData,
  ServiceRequestInputsChangedEventData,
  ServiceRequestPublishedEventData,
} from './matching-event.types.js';

@Controller()
export class MatchingEventConsumer {
  private readonly logger = new Logger(MatchingEventConsumer.name);

  constructor(
    private readonly consumedEvents: ConsumedEventRepository,
    private readonly projectionService: ServiceRequestProjectionService,
    private readonly jobQueue: MatchingJobQueueService,
  ) {}

  private ack(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
    }
  }

  private nack(context: any, requeue = false): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage();
      if (channel && originalMsg) {
        channel.nack(originalMsg, false, requeue);
      }
    }
  }

  private async handleFailure(
    event: any,
    eventType: string,
    error: Error,
    context: any,
  ): Promise<void> {
    // A crashed worker's lease must expire before recovery; contention is not a failed delivery.
    if (error instanceof MatchRunBusyError) {
      if (process.env.NODE_ENV !== 'test')
        await new Promise((resolve) => setTimeout(resolve, 1000));
      this.nack(context, true);
      return;
    }
    // A DB-backed dead letter is committed before ACK, including payload for explicit replay.
    const key =
      event?.eventId ||
      createHash('sha256')
        .update(JSON.stringify(event ?? null))
        .digest('hex');
    try {
      if (
        await this.consumedEvents.recordFailure(key, eventType, event, error)
      ) {
        this.ack(context);
        return;
      }
    } catch (storageError) {
      this.logger.error(
        `Cannot retain failed event: ${(storageError as Error).message}`,
      );
    }
    // DB unavailable: retain broker ownership through requeue, never silently discard.
    if (process.env.NODE_ENV !== 'test')
      await new Promise((resolve) => setTimeout(resolve, 1000));
    this.nack(context, true);
  }

  /**
   * Consumer for 'service_request.published'
   * Initiates initial Matching execution for revision 1.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED)
  async handleServiceRequestPublished(
    @Payload() event: DomainEvent<ServiceRequestPublishedEventData> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data: ServiceRequestPublishedEventData =
      event?.data || event?.payload || event;

    try {
      const reqId =
        data?.serviceRequestId || data?.requestId || (data as any)?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in service_request.published (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      // 1. Transactional Inbox Idempotency Check
      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.logger.warn(
            `Duplicate event ${eventId} ignored for service_request.published (${reqId})`,
          );
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming service_request.published for request ${reqId} (rev ${data.matchingRevision || 1})`,
      );

      // 2. Update read-model projection
      await this.projectionService.upsertPublishedRequest({
        id: reqId,
        requestCode:
          data.requestCode || `REQ-${reqId.slice(0, 8).toUpperCase()}`,
        customerUserId: data.customerUserId,
        serviceId: data.serviceId,
        description: data.description,
        scheduledAt: data.scheduledAt,
        addressText: data.addressText,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        matchingRevision: data.matchingRevision || 1,
        status: 'open_for_bidding',
        biddingClosesAt: data.biddingClosesAt,
        selectionExpiresAt: data.selectionExpiresAt,
      });

      // 3. Enqueue and await bounded matching job (ensures durability and no premature ACK)
      await this.jobQueue.enqueueAndWait({
        maxAttempts: 1,
        jobId: `MATCH-${reqId}-REV${data.matchingRevision || 1}-RUN1`,
        serviceRequestId: reqId,
        serviceId: data.serviceId,
        requestRevision: data.matchingRevision || 1,
        runNumber: 1,
        customerUserId: data.customerUserId,
        description: data.description || '',
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
      });

      // 4. Mark event consumed in Inbox
      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED,
        );
      }

      this.ack(context);
      return { status: 'enqueued', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process service_request.published: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'service_request.matching_inputs_changed'
   * Triggers a new Match Run for incremented request revision.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_MATCHING_INPUTS_CHANGED)
  async handleMatchingInputsChanged(
    @Payload() event: DomainEvent<ServiceRequestInputsChangedEventData> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data: ServiceRequestInputsChangedEventData =
      event?.data || event?.payload || event;

    try {
      const reqId =
        data?.serviceRequestId || data?.requestId || (data as any)?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in service_request.matching_inputs_changed (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming service_request.matching_inputs_changed for request ${reqId} (rev ${data.matchingRevision})`,
      );

      // 1. Update projection
      await this.projectionService.updateMatchingInputs({
        id: reqId,
        matchingRevision: data.matchingRevision,
        serviceId: data.serviceId,
        description: data.description,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
      });

      // 2. Enqueue and await background matching job for new revision
      await this.jobQueue.enqueueAndWait({
        maxAttempts: 1,
        jobId: `MATCH-${reqId}-REV${data.matchingRevision}-RUN1`,
        serviceRequestId: reqId,
        serviceId: data.serviceId,
        requestRevision: data.matchingRevision,
        runNumber: 1,
        customerUserId: data.customerUserId,
        description: data.description || '',
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
      });

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_MATCHING_INPUTS_CHANGED,
        );
      }

      this.ack(context);
      return { status: 'enqueued', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process service_request.matching_inputs_changed: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.SERVICE_REQUEST_MATCHING_INPUTS_CHANGED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'service_request.cancelled'
   * Invalidates active recommendations for this request.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED)
  async handleServiceRequestCancelled(
    @Payload() event: DomainEvent<ServiceRequestCancelledEventData> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data: ServiceRequestCancelledEventData =
      event?.data || event?.payload || event;

    try {
      const reqId =
        data?.serviceRequestId || data?.requestId || (data as any)?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in service_request.cancelled (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming service_request.cancelled for request ${reqId}`,
      );

      // Update projection status to cancelled
      await this.projectionService.updateRequestStatus(reqId, 'cancelled');

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process service_request.cancelled: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'service_request.converted_to_order'
   * Closes matching and marks request as converted.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CONVERTED_TO_ORDER)
  async handleServiceRequestConverted(
    @Payload()
    event: DomainEvent<ServiceRequestConvertedToOrderEventData> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data: ServiceRequestConvertedToOrderEventData =
      event?.data || event?.payload || event;

    try {
      const reqId =
        data?.serviceRequestId || data?.requestId || (data as any)?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in service_request.converted_to_order (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming service_request.converted_to_order for request ${reqId}`,
      );

      await this.projectionService.updateRequestStatus(
        reqId,
        'converted_to_order',
      );

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_CONVERTED_TO_ORDER,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process service_request.converted_to_order: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.SERVICE_REQUEST_CONVERTED_TO_ORDER,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'service_request.bidding_closed' (PR34-08)
   * Updates projection status to 'bidding_closed' so worker feed removes the request.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_BIDDING_CLOSED)
  async handleServiceRequestBiddingClosed(
    @Payload() event: DomainEvent<any> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data = event?.data || event?.payload || event;

    try {
      const reqId = data?.serviceRequestId || data?.requestId || data?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in service_request.bidding_closed (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming service_request.bidding_closed for request ${reqId}`,
      );

      await this.projectionService.updateRequestStatus(reqId, 'bidding_closed');

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_BIDDING_CLOSED,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process service_request.bidding_closed: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.SERVICE_REQUEST_BIDDING_CLOSED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'service_request.expired' (PR34-08)
   * Updates projection status to 'expired'.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_EXPIRED)
  async handleServiceRequestExpired(
    @Payload() event: DomainEvent<any> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data = event?.data || event?.payload || event;

    try {
      const reqId = data?.serviceRequestId || data?.requestId || data?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in service_request.expired (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(`Consuming service_request.expired for request ${reqId}`);

      await this.projectionService.updateRequestStatus(reqId, 'expired');

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_EXPIRED,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process service_request.expired: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.SERVICE_REQUEST_EXPIRED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'bidding.round.closed'
   * Updates projection status to 'bidding_closed' so worker feed removes the request.
   */
  @EventPattern(EVENT_PATTERNS.BIDDING_ROUND_CLOSED)
  async handleBiddingRoundClosed(
    @Payload() event: DomainEvent<any> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data = event?.data || event?.payload || event;

    try {
      const reqId = data?.serviceRequestId || data?.requestId || data?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in bidding.round.closed (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming bidding.round.closed for request ${reqId}`,
      );

      await this.projectionService.updateRequestStatus(reqId, 'bidding_closed');

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.BIDDING_ROUND_CLOSED,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process bidding.round.closed: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.BIDDING_ROUND_CLOSED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'bidding.round.finalized'
   * Updates projection status to 'converted_to_order' when bidding finalizes.
   */
  @EventPattern(EVENT_PATTERNS.BIDDING_ROUND_FINALIZED)
  async handleBiddingRoundFinalized(
    @Payload() event: DomainEvent<any> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data = event?.data || event?.payload || event;

    try {
      const reqId = data?.serviceRequestId || data?.requestId || data?.id;
      if (!reqId) {
        this.logger.warn(
          `Missing serviceRequestId/requestId in bidding.round.finalized (${eventId})`,
        );
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming bidding.round.finalized for request ${reqId}`,
      );

      await this.projectionService.updateRequestStatus(
        reqId,
        'converted_to_order',
      );

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.BIDDING_ROUND_FINALIZED,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process bidding.round.finalized: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.BIDDING_ROUND_FINALIZED,
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'bidding.round.cancelled'
   */
  @EventPattern('bidding.round.cancelled')
  async handleBiddingRoundCancelled(
    @Payload() event: DomainEvent<any> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data = event?.data || event?.payload || event;

    try {
      const reqId = data?.serviceRequestId || data?.requestId || data?.id;
      if (!reqId) {
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(
        `Consuming bidding.round.cancelled for request ${reqId}`,
      );

      await this.projectionService.updateRequestStatus(reqId, 'cancelled');

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          'bidding.round.cancelled',
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process bidding.round.cancelled: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        'bidding.round.cancelled',
        err as Error,
        context,
      );
      throw err;
    }
  }

  /**
   * Consumer for 'order.created'
   */
  @EventPattern(EVENT_PATTERNS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() event: DomainEvent<any> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data = event?.data || event?.payload || event;

    try {
      const reqId = data?.serviceRequestId || data?.requestId;
      if (!reqId) {
        this.ack(context);
        return { status: 'invalid_event', eventId };
      }

      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      this.logger.log(`Consuming order.created for request ${reqId}`);

      await this.projectionService.updateRequestStatus(
        reqId,
        'converted_to_order',
      );

      if (eventId) {
        await this.consumedEvents.markEventConsumed(
          eventId,
          EVENT_PATTERNS.ORDER_CREATED,
        );
      }

      this.ack(context);
      return { status: 'processed', eventId };
    } catch (err) {
      this.logger.error(
        `Failed to process order.created: ${(err as Error).message}`,
      );
      await this.handleFailure(
        event,
        EVENT_PATTERNS.ORDER_CREATED,
        err as Error,
        context,
      );
      throw err;
    }
  }
}

