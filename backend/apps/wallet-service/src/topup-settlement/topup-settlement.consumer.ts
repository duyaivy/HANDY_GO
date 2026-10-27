import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { AppException } from '@app/common';
import { ConsumerRetryService } from '../common/messaging/consumer-retry.service.js';
import { TopupSettlementService } from './topup-settlement.service.js';
import { PaymentTopupSucceededDto } from './dto/payment-topup-succeeded.dto.js';

@Controller()
export class TopupSettlementConsumer {
  private readonly logger = new Logger(TopupSettlementConsumer.name);

  constructor(
    private readonly service: TopupSettlementService,
    private readonly retry: ConsumerRetryService,
  ) {}

  @EventPattern('payment.topup.succeeded')
  async onTopupSucceeded(
    @Payload() event: PaymentTopupSucceededDto,
    @Ctx() context: unknown,
  ): Promise<void> {
    const rmqContext = context as RmqContext;

    // Fix I: comprehensive validation
    const validationError = this.validateEvent(event);
    if (validationError) {
      this.logger.warn({ reason: validationError }, 'Invalid topup event payload — quarantined');
      await this.service.quarantine(event, validationError);
      await this.retry.deadLetter(rmqContext, validationError);
      return;
    }

    try {
      await this.service.settle(event);
      rmqContext.getChannelRef().ack(rmqContext.getMessage());
    } catch (error) {
      const isPermanent = this.isPermanentError(error);
      if (isPermanent) {
        this.logger.warn({ error, paymentId: event.paymentId }, 'Permanent error processing topup event — message quarantined');
        await this.service.quarantine(event, 'permanent processing error', error);
        await this.retry.deadLetter(rmqContext, 'permanent processing error');
      } else {
        this.logger.error({ error, paymentId: event.paymentId }, 'Transient error processing topup event — scheduling retry');
        const outcome = await this.retry.retryOrDeadLetter(rmqContext, (error as Error).message);
        if (outcome.action === 'dead_letter') {
          await this.service.quarantine(event, 'retries exhausted', error);
        }
      }
    }
  }

  private readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private readonly BIGINT_MAX = 9223372036854775807n;

  private validateEvent(event: unknown): string | null {
    if (!event || typeof event !== 'object') return 'event is not an object';
    const e = event as Record<string, unknown>;
    if (typeof e['userId'] !== 'string' || !this.UUID_REGEX.test(e['userId'])) return 'userId must be a valid UUID';
    if (typeof e['paymentId'] !== 'string' || !this.UUID_REGEX.test(e['paymentId'])) return 'paymentId must be a valid UUID';
    if (typeof e['idempotencyKey'] !== 'string' || e['idempotencyKey'].length === 0 || e['idempotencyKey'].length > 160) return 'idempotencyKey must be a non-empty string of max 160 chars';
    if (typeof e['amount'] !== 'string' || !/^[1-9]\d*$/.test(e['amount'])) return 'amount must be a positive integer string';
    try {
      if (BigInt(e['amount'] as string) > this.BIGINT_MAX) return 'amount exceeds PostgreSQL BIGINT max';
    } catch {
      return 'amount is not a valid integer';
    }
    return null;
  }

  private isPermanentError(error: unknown): boolean {
    if (error instanceof AppException) {
      const status = error.getStatus();
      // 4xx except 429 (rate limit) are permanent
      return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
    }
    return false;
  }
}
