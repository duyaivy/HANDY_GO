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
    const data: ServiceRequestPublishedEventData = event?.data || event;

    try {
      // 1. Transactional Inbox Idempotency Check
      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.logger.warn(
            `Duplicate event ${eventId} ignored for service_request.published (${data?.serviceRequestId})`,
          );
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      const reqId = data.serviceRequestId || (data as any).id;
      this.logger.log(
        `Consuming service_request.published for request ${reqId} (rev ${data.matchingRevision || 1})`,
      );

      // 2. Update read-model projection
      await this.projectionService.upsertPublishedRequest({
        id: reqId,
        requestCode: data.requestCode || `REQ-${reqId.slice(0, 8).toUpperCase()}`,
        customerUserId: data.customerUserId,
        serviceId: data.serviceId,
        description: data.description,
        scheduledAt: data.scheduledAt,
        addressText: data.addressText,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        matchingRevision: data.matchingRevision || 1,
        status: 'open_for_bidding',
      });

      // 3. Enqueue asynchronous bounded matching job
      await this.jobQueue.enqueue({
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
      this.nack(context, true);
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
    const data: ServiceRequestInputsChangedEventData = event?.data || event;

    try {
      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      const reqId = data.serviceRequestId || (data as any).id;
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

      // 2. Enqueue asynchronous background matching job for new revision
      await this.jobQueue.enqueue({
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
      this.nack(context, true);
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
    const data: ServiceRequestCancelledEventData = event?.data || event;

    try {
      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      const reqId = data.serviceRequestId || (data as any).id;
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
      this.nack(context, false);
      throw err;
    }
  }

  /**
   * Consumer for 'service_request.converted_to_order'
   * Closes matching and marks request as converted.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CONVERTED_TO_ORDER)
  async handleServiceRequestConverted(
    @Payload() event: DomainEvent<ServiceRequestConvertedToOrderEventData> | any,
    @Ctx() context?: any,
  ): Promise<{ status: string; eventId?: string }> {
    const eventId = event?.eventId;
    const data: ServiceRequestConvertedToOrderEventData = event?.data || event;

    try {
      if (eventId) {
        const isDuplicate = await this.consumedEvents.isEventConsumed(eventId);
        if (isDuplicate) {
          this.ack(context);
          return { status: 'duplicate', eventId };
        }
      }

      const reqId = data.serviceRequestId || (data as any).id;
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
      this.nack(context, false);
      throw err;
    }
  }
}
