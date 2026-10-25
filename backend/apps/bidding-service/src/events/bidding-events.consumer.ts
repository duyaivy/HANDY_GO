import { Controller, Logger, BadRequestException } from '@nestjs/common';
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
      await this.roundsService.openRound({
        serviceRequestId,
        customerId:
          payload.customerId ||
          payload.customerUserId ||
          payload.userId,
        opensAt: payload.opensAt ? new Date(payload.opensAt) : undefined,
        closesAt: payload.closesAt ? new Date(payload.closesAt) : undefined,
        durationHours: payload.durationHours,
        eventId,
      });

      this.ackMessage(context, eventId);
    } catch (error) {
      this.logger.error(
        `Failed to handle service_request.published for request ${serviceRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      const isTransient = !(error instanceof BadRequestException);
      this.nackMessage(context, isTransient, eventId);
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
      this.ackMessage(context, eventId);
      return;
    }

    try {
      await this.roundsService.cancelRound({
        serviceRequestId,
        eventId,
      });

      this.ackMessage(context, eventId);
    } catch (error) {
      this.logger.error(
        `Failed to handle service_request.cancelled for request ${serviceRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      const isTransient = !(error instanceof BadRequestException);
      this.nackMessage(context, isTransient, eventId);
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
      this.ackMessage(context, eventId);
      return;
    }

    if (!orderId) {
      this.logger.error('order.created event missing orderId; permanent contract violation');
      this.nackMessage(context, false, eventId);
      return;
    }

    try {
      await this.roundsService.finalizeRound({
        serviceRequestId,
        orderId,
        selectedBidId,
        winningWorkerId: workerId,
        eventId,
      });

      this.ackMessage(context, eventId);
    } catch (error) {
      this.logger.error(
        `Failed to handle order.created for request ${serviceRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      const isTransient = !(error instanceof BadRequestException);
      this.nackMessage(context, isTransient, eventId);
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
      this.ackMessage(context, roundId);
    } catch (error) {
      this.logger.error(
        `Failed to expire round ${roundId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      this.nackMessage(context, true, roundId);
    }
  }

  private readonly retryAttempts = new Map<string, number>();

  private ackMessage(context: any, key?: string): void {
    if (key) {
      this.retryAttempts.delete(key);
    }
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        channel.ack(originalMsg);
      }
    }
  }

  private nackMessage(
    context: any,
    isTransient = true,
    messageKey?: string,
  ): void {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        const key =
          messageKey ||
          originalMsg.properties?.messageId ||
          String(originalMsg.fields?.deliveryTag);

        const currentAttempts = (this.retryAttempts.get(key) || 0) + 1;
        this.retryAttempts.set(key, currentAttempts);

        // Bounded retry: requeue maximum 3 times for transient failures
        const shouldRequeue = isTransient && currentAttempts < 3;
        if (!shouldRequeue) {
          this.retryAttempts.delete(key);
        }

        channel.nack(originalMsg, false, shouldRequeue);
        this.logger.warn(
          `Message ${key} nacked (requeue=${shouldRequeue}, attempts=${currentAttempts})`,
        );
      }
    }
  }
}
