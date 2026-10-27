import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@app/common';
import { TrackingEventsService } from './tracking-events.service.js';
import type { EventEnvelope } from './dto/event-envelope.dto.js';

@Controller()
export class TrackingEventsConsumer {
  private readonly logger = new Logger(TrackingEventsConsumer.name);

  constructor(private readonly eventsService: TrackingEventsService) {}

  // ==========================================================================
  // SERVICE REQUEST EVENTS
  // ==========================================================================

  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CREATED)
  async handleServiceRequestCreated(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.SERVICE_REQUEST_CREATED);
  }

  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED)
  async handleServiceRequestPublished(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED);
  }

  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED)
  async handleServiceRequestCancelled(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED);
  }

  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_EXPIRED)
  async handleServiceRequestExpired(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.SERVICE_REQUEST_EXPIRED);
  }

  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CONVERTED_TO_ORDER)
  async handleServiceRequestConvertedToOrder(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(
      data,
      context,
      EVENT_PATTERNS.SERVICE_REQUEST_CONVERTED_TO_ORDER,
    );
  }

  // ==========================================================================
  // MATCHING EVENTS
  // ==========================================================================

  @EventPattern(EVENT_PATTERNS.MATCHING_STARTED)
  async handleMatchingStarted(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.MATCHING_STARTED);
  }

  @EventPattern(EVENT_PATTERNS.MATCHING_COMPLETED)
  async handleMatchingCompleted(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.MATCHING_COMPLETED);
  }

  @EventPattern(EVENT_PATTERNS.MATCHING_FAILED)
  async handleMatchingFailed(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.MATCHING_FAILED);
  }

  // ==========================================================================
  // BIDDING ROUND & BID EVENTS
  // ==========================================================================

  @EventPattern(EVENT_PATTERNS.BIDDING_ROUND_OPENED)
  async handleBiddingRoundOpened(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BIDDING_ROUND_OPENED);
  }

  @EventPattern(EVENT_PATTERNS.BIDDING_ROUND_CLOSED)
  async handleBiddingRoundClosed(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BIDDING_ROUND_CLOSED);
  }

  @EventPattern(EVENT_PATTERNS.BIDDING_ROUND_FINALIZED)
  async handleBiddingRoundFinalized(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BIDDING_ROUND_FINALIZED);
  }

  @EventPattern(EVENT_PATTERNS.BID_SUBMITTED)
  async handleBidSubmitted(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BID_SUBMITTED);
  }

  @EventPattern(EVENT_PATTERNS.BID_REVISED)
  async handleBidRevised(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BID_REVISED);
  }

  @EventPattern(EVENT_PATTERNS.BID_WITHDRAWN)
  async handleBidWithdrawn(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BID_WITHDRAWN);
  }

  // ==========================================================================
  // BOOKING PROPOSAL EVENTS
  // ==========================================================================

  @EventPattern(EVENT_PATTERNS.BOOKING_PROPOSAL_CREATED)
  async handleBookingProposalCreated(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.BOOKING_PROPOSAL_CREATED);
  }

  @EventPattern(EVENT_PATTERNS.BOOKING_PROPOSAL_CHANGES_REQUESTED)
  async handleBookingProposalChangesRequested(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(
      data,
      context,
      EVENT_PATTERNS.BOOKING_PROPOSAL_CHANGES_REQUESTED,
    );
  }

  @EventPattern(EVENT_PATTERNS.BOOKING_PROPOSAL_REJECTED)
  async handleBookingProposalRejected(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(
      data,
      context,
      EVENT_PATTERNS.BOOKING_PROPOSAL_REJECTED,
    );
  }

  @EventPattern(EVENT_PATTERNS.BOOKING_PROPOSAL_WITHDRAWN)
  async handleBookingProposalWithdrawn(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(
      data,
      context,
      EVENT_PATTERNS.BOOKING_PROPOSAL_WITHDRAWN,
    );
  }

  @EventPattern(EVENT_PATTERNS.BOOKING_PROPOSAL_FINALIZED)
  async handleBookingProposalFinalized(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(
      data,
      context,
      EVENT_PATTERNS.BOOKING_PROPOSAL_FINALIZED,
    );
  }

  // ==========================================================================
  // ORDER EVENTS
  // ==========================================================================

  @EventPattern(EVENT_PATTERNS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.ORDER_CREATED);
  }

  @EventPattern(EVENT_PATTERNS.ORDER_STATUS_CHANGED)
  async handleOrderStatusChanged(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.ORDER_STATUS_CHANGED);
  }

  @EventPattern(EVENT_PATTERNS.ORDER_COMPLETED)
  async handleOrderCompleted(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.ORDER_COMPLETED);
  }

  @EventPattern(EVENT_PATTERNS.ORDER_CANCELLED)
  async handleOrderCancelled(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.ORDER_CANCELLED);
  }

  // ==========================================================================
  // PAYMENT EVENTS
  // ==========================================================================

  @EventPattern(EVENT_PATTERNS.PAYMENT_PENDING)
  async handlePaymentPending(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.PAYMENT_PENDING);
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT_SUCCEEDED)
  async handlePaymentSucceeded(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.PAYMENT_SUCCEEDED);
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT_COMPLETED)
  async handlePaymentCompleted(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.PAYMENT_SUCCEEDED);
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.PAYMENT_FAILED);
  }

  @EventPattern(EVENT_PATTERNS.PAYMENT_REFUNDED)
  async handlePaymentRefunded(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    await this.processEvent(data, context, EVENT_PATTERNS.PAYMENT_REFUNDED);
  }

  // ==========================================================================
  // INTERNAL HANDLER HELPER
  // ==========================================================================

  private async processEvent(
    data: EventEnvelope,
    context: any,
    fallbackPattern: string,
  ): Promise<void> {
    const eventId = data?.eventId || data?.id;
    try {
      await this.eventsService.recordDomainEvent(data, fallbackPattern);
      this.ackMessage(context);
    } catch (error: any) {
      this.logger.error(
        `Error consuming ${fallbackPattern} (eventId: ${eventId}): ${error.message}`,
        error.stack,
      );

      // Determine if error is transient (e.g. database connectivity) or permanent
      const isTransient = this.isTransientError(error);
      this.nackMessage(context, isTransient);
    }
  }

  private isTransientError(error: any): boolean {
    const msg = error?.message || '';
    return (
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('Connection terminated') ||
      msg.includes('ECONNREFUSED')
    );
  }

  private ackMessage(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      try {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        channel.ack(originalMsg);
      } catch (err: any) {
        this.logger.warn(`Failed to ack message: ${err.message}`);
      }
    }
  }

  private nackMessage(context: any, requeue: boolean): void {
    if (context && typeof context.getChannelRef === 'function') {
      try {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();
        channel.nack(originalMsg, false, requeue);
      } catch (err: any) {
        this.logger.warn(`Failed to nack message: ${err.message}`);
      }
    }
  }
}
