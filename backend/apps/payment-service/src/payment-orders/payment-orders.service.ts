import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import type { Payment, PaymentAttempt } from '@prisma/payment-client';
import { OrderEligibilityClient } from '../common/clients/order-eligibility.client.js';
import { interpretWalletResult, type DebitOutcome } from '../common/clients/wallet-outcome.js';
import { WalletClient } from '../common/clients/wallet.client.js';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { assertPaymentTransition } from '../common/domain/payment-state.js';
import { paymentFailedEvent, paymentSucceededEvent, type PaymentTx } from '../common/outbox/payment-events.js';
import { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import { PaymentQueryService } from '../payment-query/payment-query.service.js';
import type { CreatePaymentDto } from './dto/payment-orders.dto.js';

const OPEN_STATUSES = ['pending', 'failed'];
const SETTLED_STATUSES = ['succeeded', 'partially_refunded', 'refunded'];

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment not found');
}

function conflict(message: string): AppException {
  return new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, message);
}

@Injectable()
export class PaymentOrdersService {
  private readonly logger = new Logger(PaymentOrdersService.name);

  constructor(
    private readonly database: PaymentPrismaService,
    private readonly orders: OrderEligibilityClient,
    private readonly wallet: WalletClient,
    private readonly outbox: PaymentOutboxService,
    private readonly query: PaymentQueryService,
  ) {}

  private async lock(tx: PaymentTx, id: string): Promise<Payment | null> {
    await tx.$queryRaw`SELECT id FROM "payment_service"."payments" WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.payment.findUnique({ where: { id } });
  }

  private async nextAttemptNo(tx: PaymentTx, paymentId: string): Promise<number> {
    const max = await tx.paymentAttempt.aggregate({ where: { paymentId }, _max: { attemptNo: true } });
    return (max._max.attemptNo ?? 0) + 1;
  }

  // PAY-02: choose/confirm the method for a pre-created payment. Never charges.
  async open(userId: string, dto: CreatePaymentDto) {
    const eligibility = await this.orders.getEligibility(dto.orderId);
    if (eligibility.customerUserId !== userId) throw notFound();
    if (!eligibility.isEligibleForSettlement) throw conflict('Order is not eligible for payment');

    const paymentId = await this.database.client.$transaction(async (tx) => {
      const found = await tx.payment.findUnique({ where: { orderId: dto.orderId } });
      if (!found) throw conflict('Payment is not ready for this order yet');
      const payment = await this.lock(tx, found.id);
      if (!payment) throw notFound();
      if (
        payment.customerUserId !== userId ||
        payment.workerUserId !== eligibility.workerUserId ||
        payment.amount !== eligibility.amount
      ) {
        throw conflict('Order data does not match the payment snapshot');
      }
      if (SETTLED_STATUSES.includes(payment.status)) {
        if (payment.method === dto.method) return payment.id;
        throw conflict('Payment is already settled with another method');
      }
      if (!OPEN_STATUSES.includes(payment.status)) throw conflict(`Payment is ${payment.status} and cannot change method`);
      if (payment.method !== dto.method || !payment.orderCompletedAt) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { method: dto.method, orderCompletedAt: payment.orderCompletedAt ?? new Date() },
        });
      }
      return payment.id;
    });
    return this.query.findById(paymentId, userId);
  }

  // PAY-03: only the order's worker can confirm receiving cash.
  async confirmCash(userId: string, paymentId: string) {
    const confirmed = await this.database.client.$transaction(async (tx) => {
      const payment = await this.lock(tx, paymentId);
      if (!payment || payment.workerUserId !== userId) throw notFound();
      if (payment.status === 'succeeded' && payment.method === 'cash') return false;
      if (payment.method !== 'cash') throw conflict('Payment method is not cash');
      if (!payment.orderCompletedAt) throw conflict('Order has not been completed yet');
      assertPaymentTransition(payment.status, 'succeeded');
      const now = new Date();
      await tx.paymentAttempt.create({
        data: {
          paymentId,
          attemptNo: await this.nextAttemptNo(tx, paymentId),
          method: 'cash',
          provider: 'cash_manual',
          status: 'succeeded',
          completedAt: now,
        },
      });
      const succeeded = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'succeeded', paidAt: now, cashConfirmedByUserId: userId, failureReason: null },
      });
      await tx.paymentSettlement.create({
        data: {
          paymentId,
          status: 'receivable',
          grossAmount: payment.amount,
          platformFee: payment.platformFee,
          workerEarning: payment.workerEarning,
        },
      });
      // Cash never credits the worker; only the platform commission becomes due.
      if (payment.platformFee > 0n) {
        await tx.commissionReceivable.create({
          data: { paymentId, workerUserId: payment.workerUserId, amountDue: payment.platformFee },
        });
      }
      await this.outbox.enqueue(tx, paymentSucceededEvent(succeeded));
      return payment.platformFee > 0n;
    });
    if (confirmed) await this.collectCommission(paymentId);
    return this.query.findById(paymentId, userId);
  }

  // Idempotent per payment (Wallet operation `commission:<paymentId>`); a shortfall keeps the debt due.
  async collectCommission(paymentId: string): Promise<'collected' | 'pending' | 'noop'> {
    const receivable = await this.database.client.commissionReceivable.findUnique({ where: { paymentId } });
    if (!receivable || !['due', 'partially_collected'].includes(receivable.status)) return 'noop';
    const amount = receivable.amountDue - receivable.amountCollected;
    if (amount <= 0n) return 'noop';
    const result = await this.wallet.collectCommission({
      paymentId,
      workerUserId: receivable.workerUserId,
      amount: amount.toString(),
      idempotencyKey: paymentId,
    });
    if (result.outcome !== 'ok') {
      this.logger.warn(`Commission for payment ${paymentId} stays due (${result.outcome})`);
      return 'pending';
    }
    await this.database.client.$transaction(async (tx) => {
      await tx.commissionReceivable.updateMany({
        where: { paymentId, status: { in: ['due', 'partially_collected'] } },
        data: { status: 'collected', amountCollected: receivable.amountDue },
      });
      await tx.paymentSettlement.updateMany({
        where: { paymentId, status: 'receivable' },
        data: { status: 'settled', settledAt: new Date() },
      });
    });
    return 'collected';
  }

  // PAY-04: customer-confirmed Point payment. One fixed attempt/operation; never a blind retry.
  async payWithPoints(userId: string, paymentId: string) {
    const prepared = await this.database.client.$transaction(async (tx) => {
      const payment = await this.lock(tx, paymentId);
      if (!payment || payment.customerUserId !== userId) throw notFound();
      if (payment.status === 'succeeded' && payment.method === 'point') return null;
      if (payment.method !== 'point') throw conflict('Payment method is not point');
      if (!payment.orderCompletedAt) throw conflict('Order has not been completed yet');
      // Wallet rejects zero earnings, so this allocation cannot be settled in Points yet.
      if (payment.workerEarning <= 0n) throw conflict('Point payment is unavailable for this allocation');

      const inFlight = await tx.paymentAttempt.findFirst({
        where: { paymentId, method: 'point', status: 'processing' },
        orderBy: { attemptNo: 'desc' },
      });
      if (inFlight) return { payment, attempt: inFlight };

      if (!OPEN_STATUSES.includes(payment.status)) throw conflict(`Payment is ${payment.status}`);
      assertPaymentTransition(payment.status, 'processing');
      const attempt = await tx.paymentAttempt.create({
        data: {
          paymentId,
          attemptNo: await this.nextAttemptNo(tx, paymentId),
          method: 'point',
          provider: 'wallet_internal',
          status: 'processing',
        },
      });
      const processing = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'processing', failureReason: null },
      });
      return { payment: processing, attempt };
    });
    if (prepared) await this.executeDebit(prepared.payment, prepared.attempt);
    return this.query.findById(paymentId, userId);
  }

  // Wallet is idempotent on `paymentId:attemptId`, so re-running this for the same attempt is safe.
  async executeDebit(payment: Payment, attempt: PaymentAttempt): Promise<DebitOutcome['kind']> {
    const operationId = `${payment.id}:${attempt.id}`;
    let outcome = interpretWalletResult(
      await this.wallet.debitPayment(payment.customerUserId, {
        paymentId: payment.id,
        attemptId: attempt.id,
        workerUserId: payment.workerUserId,
        grossAmount: payment.amount.toString(),
        workerEarning: payment.workerEarning.toString(),
        platformFee: payment.platformFee.toString(),
      }),
    );
    if (outcome.kind === 'unknown') outcome = interpretWalletResult(await this.wallet.getOperation(operationId));
    if (outcome.kind === 'success') await this.finalizeSuccess(payment.id, attempt.id);
    else if (outcome.kind === 'failed') await this.finalizeFailure(payment.id, attempt.id, outcome.reason);
    else this.logger.warn(`Wallet outcome for ${operationId} is unknown; attempt stays processing for reconciliation`);
    return outcome.kind;
  }

  private async finalizeSuccess(paymentId: string, attemptId: string): Promise<void> {
    await this.database.client.$transaction(async (tx) => {
      const payment = await this.lock(tx, paymentId);
      const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!payment || attempt?.status !== 'processing' || payment.status !== 'processing') return;
      const now = new Date();
      await tx.paymentAttempt.update({ where: { id: attemptId }, data: { status: 'succeeded', completedAt: now } });
      const succeeded = await tx.payment.update({ where: { id: paymentId }, data: { status: 'succeeded', paidAt: now } });
      await tx.paymentSettlement.upsert({
        where: { paymentId },
        create: {
          paymentId,
          status: 'settled',
          grossAmount: payment.amount,
          platformFee: payment.platformFee,
          workerEarning: payment.workerEarning,
          settledAt: now,
        },
        update: { status: 'settled', settledAt: now },
      });
      await this.outbox.enqueue(tx, paymentSucceededEvent(succeeded));
    });
  }

  private async finalizeFailure(paymentId: string, attemptId: string, reason: string): Promise<void> {
    await this.database.client.$transaction(async (tx) => {
      const payment = await this.lock(tx, paymentId);
      const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId } });
      if (!payment || attempt?.status !== 'processing' || payment.status !== 'processing') return;
      await tx.paymentAttempt.update({
        where: { id: attemptId },
        data: { status: 'failed', failureReason: reason, completedAt: new Date() },
      });
      const failed = await tx.payment.update({ where: { id: paymentId }, data: { status: 'failed', failureReason: reason } });
      await this.outbox.enqueue(tx, paymentFailedEvent(failed, reason));
    });
  }

  // Reconciliation: re-drive attempts whose Wallet outcome was never resolved.
  async resumeStaleAttempts(olderThanMs: number, limit = 20): Promise<number> {
    const attempts = await this.database.client.paymentAttempt.findMany({
      where: { method: 'point', status: 'processing', attemptedAt: { lt: new Date(Date.now() - olderThanMs) } },
      orderBy: { attemptedAt: 'asc' },
      take: limit,
    });
    for (const attempt of attempts) {
      const payment = await this.database.client.payment.findUnique({ where: { id: attempt.paymentId } });
      if (payment?.status === 'processing') await this.executeDebit(payment, attempt);
    }
    return attempts.length;
  }

  async collectDueCommissions(limit = 20): Promise<number> {
    const due = await this.database.client.commissionReceivable.findMany({
      where: { status: { in: ['due', 'partially_collected'] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { paymentId: true },
    });
    for (const { paymentId } of due) await this.collectCommission(paymentId);
    return due.length;
  }
}
