import { Controller, Logger, BadRequestException } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { randomUUID, createHash } from 'crypto';
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
      await this.nackMessage(context, isTransient, eventId, data, error);
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
      await this.nackMessage(context, isTransient, eventId, data, error);
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
      await this.nackMessage(context, false, eventId, data, 'Missing orderId in order.created');
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
      await this.nackMessage(context, isTransient, eventId, data, error);
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
      await this.nackMessage(context, true, roundId, data, error);
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
        try {
          channel.ack(originalMsg);
        } catch (ackError) {
          this.logger.error(
            `Failed to ack message ${key || 'unknown'}: ${(ackError as Error).message}`,
          );
        }
      }
    }
  }

  private async nackMessage(
    context: any,
    isTransient = true,
    messageKey?: string,
    rawPayload?: any,
    error?: any,
  ): Promise<void> {
    if (context && typeof context.getChannelRef === 'function') {
      const channel = context.getChannelRef();
      const originalMsg = context.getMessage?.();
      if (channel && originalMsg) {
        const key =
          messageKey ||
          originalMsg.properties?.messageId ||
          originalMsg.properties?.correlationId ||
          (originalMsg.content
            ? createHash('sha256').update(originalMsg.content).digest('hex')
            : String(originalMsg.fields?.deliveryTag));

        const currentAttempts = (this.retryAttempts.get(key) || 0) + 1;
        this.retryAttempts.set(key, currentAttempts);

        // Bounded retry: requeue maximum 3 times for transient failures
        let shouldRequeue = isTransient && currentAttempts < 3;

        if (!shouldRequeue) {
          // Attempt to persist dead-letter to database
          const persisted = await this.persistDeadLetter(
            key,
            originalMsg,
            rawPayload,
            error,
          );

          if (persisted) {
            // Successfully stored dead-letter in PostgreSQL. Safe to discard from broker queue.
            this.retryAttempts.delete(key);
            shouldRequeue = false;
          } else {
            // DB is unavailable or failed to save dead-letter.
            // NEVER discard message into the void! Requeue so broker retains it until DB recovers.
            this.logger.error(
              `Failed to persist dead letter for message ${key}. Requeueing to broker to prevent data loss.`,
            );
            shouldRequeue = true;
            const delay = process.env.NODE_ENV === 'test' ? 10 : 2000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } else {
          // Delay/backoff for transient retry (short in test environment to avoid test timeouts)
          const delay = process.env.NODE_ENV === 'test' ? 10 : 500 * currentAttempts;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
          channel.nack(originalMsg, false, shouldRequeue);
          this.logger.warn(
            `Message ${key} nacked (requeue=${shouldRequeue}, attempts=${currentAttempts})`,
          );
        } catch (nackError) {
          this.logger.error(
            `Failed to nack message ${key}: ${(nackError as Error).message}`,
          );
        }
      }
    }
  }

  private async persistDeadLetter(
    messageKey: string,
    originalMsg: any,
    payload: any,
    error: any,
  ): Promise<boolean> {
    try {
      if (typeof this.prisma.outboxEvent?.create === 'function') {
        const errorMsg =
          error instanceof Error
            ? error.message
            : String(error || 'Message processing failed permanently');
        await this.prisma.outboxEvent.create({
          data: {
            aggregateType: 'dead_letter',
            aggregateId: randomUUID(),
            eventType: 'bidding.dead_letter',
            eventVersion: 1,
            payload: {
              messageKey,
              payload: payload || null,
              content: originalMsg?.content ? originalMsg.content.toString() : null,
              error: errorMsg,
              failedAt: new Date().toISOString(),
            },
            status: 'failed',
            lastError: errorMsg,
            retryCount: 3,
          },
        });
        this.logger.warn(
          `Persisted dead-letter record for unprocessable message ${messageKey} to outbox_events with status 'failed'`,
        );
        return true;
      }
      return false;
    } catch (e: any) {
      this.logger.error(
        `Could not persist dead letter record for ${messageKey}: ${e.message}`,
      );
      return false;
    }
  }
}
