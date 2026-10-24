import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { EVENT_PATTERNS } from '@app/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoundsService } from '../rounds/rounds.service.js';

interface EventEnvelope<T = any> {
  eventId?: string;
  eventType?: string;
  serviceRequestId?: string;
  occurredAt?: string;
  payload?: T;
  [key: string]: any;
}

@Controller()
export class BiddingEventsConsumer {
  private readonly logger = new Logger(BiddingEventsConsumer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roundsService: RoundsService,
  ) {}

  /**
   * Consumes 'service_request.published'.
   * Opens the bidding round for worker bids.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED)
  async handleServiceRequestPublished(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    const eventId = data.eventId || (data as any).id;
    const payload = data.payload || data;
    const serviceRequestId =
      payload.serviceRequestId ||
      payload.requestId ||
      data.serviceRequestId;

    this.logger.log(
      `Received service_request.published event (eventId: ${eventId}, requestId: ${serviceRequestId})`,
    );

    if (!serviceRequestId) {
      this.logger.warn('service_request.published event missing serviceRequestId');
      this.ackMessage(context);
      return;
    }

    try {
      // Inbox deduplication check
      if (eventId && (await this.isEventAlreadyConsumed(eventId))) {
        this.logger.warn(`Event ${eventId} already consumed, skipping`);
        this.ackMessage(context);
        return;
      }

      await this.roundsService.openRound({
        serviceRequestId,
        opensAt: payload.opensAt ? new Date(payload.opensAt) : undefined,
        closesAt: payload.closesAt ? new Date(payload.closesAt) : undefined,
        durationHours: payload.durationHours,
      });

      if (eventId) {
        await this.recordConsumedEvent(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_PUBLISHED,
        );
      }

      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to handle service_request.published for request ${serviceRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.nackMessage(context);
    }
  }

  /**
   * Consumes 'service_request.cancelled'.
   * Cancels the bidding round and rejects remaining active bids.
   */
  @EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED)
  async handleServiceRequestCancelled(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    const eventId = data.eventId || (data as any).id;
    const payload = data.payload || data;
    const serviceRequestId =
      payload.serviceRequestId ||
      payload.requestId ||
      data.serviceRequestId;

    this.logger.log(
      `Received service_request.cancelled event (eventId: ${eventId}, requestId: ${serviceRequestId})`,
    );

    if (!serviceRequestId) {
      this.logger.warn('service_request.cancelled event missing serviceRequestId');
      this.ackMessage(context);
      return;
    }

    try {
      if (eventId && (await this.isEventAlreadyConsumed(eventId))) {
        this.logger.warn(`Event ${eventId} already consumed, skipping`);
        this.ackMessage(context);
        return;
      }

      await this.roundsService.cancelRound(serviceRequestId);

      if (eventId) {
        await this.recordConsumedEvent(
          eventId,
          EVENT_PATTERNS.SERVICE_REQUEST_CANCELLED,
        );
      }

      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to handle service_request.cancelled for request ${serviceRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.nackMessage(context);
    }
  }

  /**
   * Consumes 'order.created'.
   * Finalizes the bidding round, marks winning bid selected (if from bid)
   * and rejects other active quotes.
   */
  @EventPattern(EVENT_PATTERNS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    const eventId = data.eventId || (data as any).id;
    const payload = data.payload || data;
    const serviceRequestId =
      payload.serviceRequestId ||
      payload.requestId ||
      data.serviceRequestId;
    const orderId = payload.orderId || payload.id;
    const selectedBidId = payload.selectedBidId || payload.bidId;
    const workerId = payload.workerId;

    this.logger.log(
      `Received order.created event (eventId: ${eventId}, orderId: ${orderId}, requestId: ${serviceRequestId}, selectedBidId: ${selectedBidId})`,
    );

    if (!serviceRequestId) {
      this.logger.warn('order.created event missing serviceRequestId');
      this.ackMessage(context);
      return;
    }

    try {
      if (eventId && (await this.isEventAlreadyConsumed(eventId))) {
        this.logger.warn(`Event ${eventId} already consumed, skipping`);
        this.ackMessage(context);
        return;
      }

      await this.roundsService.finalizeRound({
        serviceRequestId,
        orderId: orderId || serviceRequestId,
        selectedBidId,
        winningWorkerId: workerId,
      });

      if (eventId) {
        await this.recordConsumedEvent(
          eventId,
          EVENT_PATTERNS.ORDER_CREATED,
        );
      }

      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to handle order.created for request ${serviceRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.nackMessage(context);
    }
  }

  /**
   * Consumes 'bidding.round.expire_check' (Scheduled / Triggered via RabbitMQ).
   * Automatically expires the round if deadline has passed.
   */
  @EventPattern(EVENT_PATTERNS.BIDDING_ROUND_EXPIRE_CHECK)
  async handleRoundExpireCheck(
    @Payload() data: EventEnvelope,
    @Ctx() context: any,
  ): Promise<void> {
    const payload = data.payload || data;
    const roundId = payload.roundId || data.roundId;

    this.logger.log(`Received bidding.round.expire_check for round ${roundId}`);

    if (!roundId) {
      this.logger.warn('bidding.round.expire_check missing roundId');
      this.ackMessage(context);
      return;
    }

    try {
      await this.roundsService.expireRoundById(roundId);
      this.ackMessage(context);
    } catch (error) {
      this.logger.error(
        `Failed to expire round ${roundId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.nackMessage(context);
    }
  }

  private async isEventAlreadyConsumed(eventId: string): Promise<boolean> {
    const record = await this.prisma.consumedEvent.findUnique({
      where: { eventId },
    });
    return !!record;
  }

  private async recordConsumedEvent(
    eventId: string,
    eventType: string,
  ): Promise<void> {
    await this.prisma.consumedEvent.create({
      data: {
        eventId,
        eventType,
        consumedAt: new Date(),
      },
    });
  }

  private ackMessage(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
    }
  }

  private nackMessage(context: any): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        // Do not requeue corrupted / permanently failing events directly into a tight loop
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
