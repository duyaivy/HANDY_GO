import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import type { Prisma, Refund } from '@prisma/payment-client';
import { AdminAuditService } from '../common/audit/admin-audit.service.js';
import { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import { parseOrderAmount } from '../common/money/payment-money.js';
import type { PaymentTx } from '../common/outbox/payment-events.js';
import { paymentRefundedEvent } from '../common/outbox/payment-events.js';
import { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import { WalletClient } from '../common/clients/wallet.client.js';
import { EVENT_PATTERNS } from '@app/common';
import type { PaymentPaginationDto } from '../payment-query/dto/payment-query.dto.js';
import type {
  AdminRefundQueryDto,
  CreateRefundDto,
  DecideRefundDto,
} from './dto/refunds.dto.js';

const reservedStatuses = [
  'pending',
  'processing',
  'needs_review',
  'completed',
] as const;
const fundingBlocked = 'Awaiting funded Wallet refund confirmation';
const PROCESSING_STALE_MS = 30_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DisputeRefundOverrideCheckResult {
  safeToOverride: boolean;
  outcome:
    | 'no_refund'
    | 'already_terminal'
    | 'cancelled'
    | 'already_completed'
    | 'refund_in_progress'
    | 'wallet_uncertain';
  refundId: string | null;
  refundStatus: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  refundAmountVnd: string | null;
}
function conflict(message: string): never {
  throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, message);
}
function missing(): never {
  throw new AppException(
    HttpStatus.NOT_FOUND,
    ERROR_CODES.NOT_FOUND,
    'Payment or refund not found',
  );
}

function serialize(
  row: Refund & {
    payment?: {
      orderId?: string;
      customerUserId?: string;
      workerUserId?: string;
    } | null;
  },
) {
  return {
    id: row.id,
    paymentId: row.paymentId,
    ...(row.payment?.orderId ? { orderId: row.payment.orderId } : {}),
    ...(row.payment?.customerUserId
      ? { customerUserId: row.payment.customerUserId }
      : {}),
    ...(row.payment?.workerUserId
      ? { workerUserId: row.payment.workerUserId }
      : {}),
    amount: row.amountVnd.toString(),
    status: row.status,
    destination: 'point' as const,
    reason: row.reason,
    requestedByUserId: row.requestedByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    rejectedByUserId: row.rejectedByUserId,
    rejectedAt: row.rejectedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
    refundedAt: row.refundedAt,
  };
}

@Injectable()
export class RefundsService {
  constructor(
    private readonly database: PaymentPrismaService,
    private readonly audit: AdminAuditService,
    private readonly wallet: WalletClient,
    private readonly outbox: PaymentOutboxService,
  ) {}

  private async lockPayment(tx: PaymentTx, id: string) {
    await tx.$queryRaw`SELECT id FROM payment_service.payments WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.payment.findUnique({ where: { id } });
  }

  async create(
    actor: string,
    paymentId: string,
    dto: CreateRefundDto,
    admin = false,
  ) {
    let amount: bigint;
    try {
      amount = parseOrderAmount(dto.amount);
    } catch {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid whole VND amount',
      );
    }
    if (!dto.reason.trim() || !dto.idempotencyKey.trim())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Reason and idempotency key are required',
      );
    return this.database.client.$transaction(async (tx) => {
      // All reservation/decision writers lock the parent first, including requests for different refund IDs.
      const payment = await this.lockPayment(tx, paymentId);
      if (!payment || (!admin && payment.customerUserId !== actor)) missing();
      // Serialize identical global keys too, so collisions across payments return a controlled conflict.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.idempotencyKey}))::text`;
      const previous = await tx.refund.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (previous) {
        if (
          previous.paymentId !== paymentId ||
          previous.requestedByUserId !== actor ||
          previous.amountVnd !== amount ||
          previous.reason !== dto.reason
        )
          conflict('Idempotency key was used for another request');
        return serialize(previous);
      }
      if (!['succeeded', 'partially_refunded'].includes(payment.status))
        conflict('Only settled payments can be refunded');
      const sum = await tx.refund.aggregate({
        where: { paymentId, status: { in: [...reservedStatuses] } },
        _sum: { amountVnd: true },
      });
      if ((sum._sum.amountVnd ?? 0n) + amount > payment.amount)
        conflict('Refund reservations exceed the paid amount');
      const row = await tx.refund.create({
        data: {
          paymentId,
          requestedByUserId: actor,
          amountVnd: amount,
          reason: dto.reason,
          idempotencyKey: dto.idempotencyKey,
        },
      });
      if (admin)
        await this.audit.record(tx, {
          actorUserId: actor,
          action: 'refund.created',
          entityType: 'refund',
          entityId: row.id,
          after: serialize(row),
          reason: dto.reason,
        });
      return serialize(row);
    });
  }

  async list(
    actor: string,
    paymentId: string,
    query: PaymentPaginationDto,
    admin = false,
  ) {
    const payment = await this.database.client.payment.findFirst({
      where: { id: paymentId, ...(admin ? {} : { customerUserId: actor }) },
      select: { id: true },
    });
    if (!payment) missing();
    const where = { paymentId };
    const [rows, total] = await this.database.client.$transaction([
      this.database.client.refund.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      }),
      this.database.client.refund.count({ where }),
    ]);
    return {
      items: rows.map(serialize),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async listAll(_actor: string, query: AdminRefundQueryDto) {
    const statusWhere: Prisma.RefundWhereInput['status'] = query.status
      ? Array.isArray(query.status)
        ? query.status.length > 0
          ? { in: query.status }
          : undefined
        : { in: [query.status] }
      : undefined;

    const where: Prisma.RefundWhereInput = {
      ...(statusWhere ? { status: statusWhere } : {}),
      ...(query.paymentId ? { paymentId: query.paymentId } : {}),
    };
    const [rows, total] = await this.database.client.$transaction([
      this.database.client.refund.findMany({
        where,
        include: {
          payment: {
            select: {
              orderId: true,
              customerUserId: true,
              workerUserId: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      }),
      this.database.client.refund.count({ where }),
    ]);
    return {
      items: rows.map(serialize),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async decide(actor: string, id: string, dto: DecideRefundDto) {
    if (!dto.reason.trim())
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Decision reason is required',
      );
    const decision = await this.database.client.$transaction(async (tx) => {
      const initial = await tx.refund.findUnique({ where: { id } });
      if (!initial) missing();
      const payment = await this.lockPayment(tx, initial.paymentId);
      if (
        payment?.customerUserId === actor ||
        initial.requestedByUserId === actor
      ) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ERROR_CODES.FORBIDDEN,
          'A requester/customer cannot decide their own refund',
        );
      }
      const row = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (row.status !== 'pending') {
        const replay = dto.approve
          ? row.approvedByUserId === actor &&
            ['needs_review', 'processing', 'completed'].includes(row.status)
          : row.rejectedByUserId === actor && row.status === 'cancelled';
        if (replay && row.decisionNote === dto.reason) return serialize(row);
        conflict('Refund already has an Admin decision');
      }
      const now = new Date();
      const updated = await tx.refund.update({
        where: { id },
        data: dto.approve
          ? {
              approvedByUserId: actor,
              approvedAt: now,
              decisionNote: dto.reason,
              status: 'needs_review',
              failureReason: fundingBlocked,
            }
          : {
              rejectedByUserId: actor,
              rejectedAt: now,
              decisionNote: dto.reason,
              status: 'cancelled',
            },
      });
      await this.audit.record(tx, {
        actorUserId: actor,
        action: dto.approve ? 'refund.approved' : 'refund.rejected',
        entityType: 'refund',
        entityId: id,
        before: serialize(row),
        after: serialize(updated),
        reason: dto.reason,
      });
      // Commit the authorization before making any remote call. Reconciliation resumes it after a crash.
      return serialize(updated);
    });
    if (dto.approve && decision.status !== 'completed') await this.execute(id);
    return serialize(
      await this.database.client.refund.findUniqueOrThrow({ where: { id } }),
    );
  }

  private async restoreNeedsReview(
    id: string,
    reason = fundingBlocked,
  ): Promise<void> {
    await this.database.client.refund.updateMany({
      where: { id, status: 'processing' },
      data: {
        status: 'needs_review',
        failureReason: reason,
        updatedAt: new Date(),
      },
    });
  }

  private async markCancelledByWalletFence(params: {
    id: string;
    paymentId: string;
    approvedByUserId: string | null;
    failureCode: string;
  }): Promise<void> {
    const { id, paymentId, approvedByUserId, failureCode } = params;
    await this.database.client.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, paymentId);
      if (!locked) return;
      const updated = await tx.refund.updateMany({
        where: { id, status: { in: ['needs_review', 'processing'] } },
        data: {
          status: 'cancelled',
          failureReason: failureCode.slice(0, 255),
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) return;
      if (approvedByUserId) {
        await this.audit.record(tx, {
          actorUserId: approvedByUserId,
          action: 'refund.cancelled_by_wallet_fence',
          entityType: 'refund',
          entityId: id,
          after: {
            status: 'cancelled',
            failureCode,
          },
          reason: failureCode,
        });
      }
    });
  }

  private async markFailedTerminal(params: {
    id: string;
    paymentId: string;
    orderId: string;
    disputeResolutionId: string | null;
    approvedByUserId: string | null;
    failureCode: string;
    failureReason: string;
  }): Promise<void> {
    const {
      id,
      paymentId,
      orderId,
      disputeResolutionId,
      approvedByUserId,
      failureCode,
      failureReason,
    } = params;
    await this.database.client.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, paymentId);
      if (!locked) return;
      const updated = await tx.refund.updateMany({
        where: { id, status: { in: ['needs_review', 'processing'] } },
        data: {
          status: 'failed',
          failureReason: failureReason.slice(0, 255),
          updatedAt: new Date(),
        },
      });
      if (updated.count !== 1) return;
      if (disputeResolutionId) {
        await this.outbox.enqueue(tx, {
          aggregateType: 'payment',
          aggregateId: paymentId,
          eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
          payload: {
            resolutionId: disputeResolutionId,
            orderId,
            paymentId,
            refundId: id,
            failureCode,
          },
        });
      }
      if (approvedByUserId) {
        await this.audit.record(tx, {
          actorUserId: approvedByUserId,
          action: 'refund.failed',
          entityType: 'refund',
          entityId: id,
          after: {
            status: 'failed',
            failureCode,
            failureReason: failureReason.slice(0, 255),
          },
          reason: failureCode,
        });
      }
    });
  }

  private async completeRefundFromWalletCommit(
    paymentId: string,
    id: string,
    transferId: string,
  ): Promise<{ paymentStatus: string; refund: Refund } | null> {
    return this.database.client.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, paymentId);
      if (!locked) return null;
      const current = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (current.status === 'completed') {
        return { paymentStatus: locked.status, refund: current };
      }
      if (!current.approvedAt) return null;
      const lateAfterCancel = ['cancelled', 'failed'].includes(current.status);
      if (
        !['needs_review', 'processing'].includes(current.status) &&
        !lateAfterCancel
      ) {
        return null;
      }
      const completed = await tx.refund.update({
        where: { id },
        data: {
          status: 'completed',
          refundedAt: new Date(),
          walletTransferId: transferId,
          failureReason: lateAfterCancel
            ? 'LATE_WALLET_COMPLETION_AFTER_CANCEL'
            : null,
        },
      });
      const sum = await tx.refund.aggregate({
        where: { paymentId, status: 'completed' },
        _sum: { amountVnd: true },
      });
      const completedTotal = sum._sum.amountVnd ?? 0n;
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status:
            completedTotal >= locked.amount
              ? 'refunded'
              : 'partially_refunded',
        },
      });
      await this.outbox.enqueue(tx, paymentRefundedEvent(updated, completed));
      if (current.disputeResolutionId) {
        await this.outbox.enqueue(tx, {
          aggregateType: 'refund',
          aggregateId: id,
          eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
          payload: {
            resolutionId: current.disputeResolutionId,
            orderId: locked.orderId,
            paymentId,
            refundId: id,
            refundAmountVnd: completed.amountVnd.toString(),
            paymentStatus: updated.status,
          },
        });
      }
      await this.audit.record(tx, {
        actorUserId: current.approvedByUserId!,
        action: lateAfterCancel
          ? 'refund.completed_late_after_cancel'
          : 'refund.completed',
        entityType: 'refund',
        entityId: id,
        after: serialize(completed),
        reason: lateAfterCancel
          ? 'Late Wallet ledger commit reconciled after override cancellation'
          : 'Wallet ledger commit verified',
      });
      return { paymentStatus: updated.status, refund: completed };
    });
  }

  private isVerifiedWalletCommit(
    committed: {
      status?: unknown;
      operationId?: unknown;
      kind?: unknown;
      amount?: unknown;
      transferId?: unknown;
    },
    operationId: string,
    amountVnd: bigint,
  ): committed is {
    status: 'completed';
    operationId: string;
    kind: 'refund';
    amount: string;
    transferId: string;
  } {
    return (
      committed.status === 'completed' &&
      committed.operationId === operationId &&
      committed.kind === 'refund' &&
      committed.amount === amountVnd.toString() &&
      typeof committed.transferId === 'string' &&
      UUID_RE.test(committed.transferId)
    );
  }

  async execute(id: string): Promise<void> {
    const row = await this.database.client.refund.findUniqueOrThrow({
      where: { id },
      include: { payment: true },
    });
    if (!row.approvedAt || !['needs_review', 'processing'].includes(row.status))
      return;
    const payment = row.payment;
    if (payment.method !== 'cash' && payment.method !== 'point') return;
    const claimed = await this.database.client.refund.updateMany({
      where: { id, status: { in: ['needs_review', 'processing'] } },
      data: {
        status: 'processing',
        failureReason: fundingBlocked,
        updatedAt: new Date(),
      },
    });
    if (claimed && claimed.count === 0) return;

    const operationId = `${payment.id}:refund:${id}`;
    // A timeout is never interpreted as a failure or permission to use another operation ID.
    let result = await this.wallet.getOperation(operationId);
    if (result.outcome === 'missing') {
      const credit = await this.wallet.refundCredit(payment.customerUserId, {
        paymentId: payment.id,
        refundId: id,
        amount: row.amountVnd.toString(),
        method: payment.method,
        grossAmount: payment.amount.toString(),
      });
      if (credit.outcome === 'rejected') {
        const failureCode = `WALLET_REJECTED_${credit.status ?? 400}`;
        const failureReason = `${failureCode}: ${credit.message}`.slice(0, 255);
        if (row.disputeResolutionId || credit.status !== 409) {
          // Never release a refund reservation based on HTTP 4xx or getOperation === 'missing'.
          // Atomically fence the operationId at Wallet first so no concurrent/retried refundCredit can commit later.
          const fence = await this.wallet.cancelRefundOperation({
            paymentId: payment.id,
            refundId: id,
            customerUserId: payment.customerUserId,
            amount: row.amountVnd.toString(),
            actorUserId: row.approvedByUserId ?? undefined,
            reason: failureReason,
            failureCode,
          });
          if (fence.outcome === 'ok') {
            if (fence.data.outcome === 'already_completed') {
              result = { outcome: 'ok', status: fence.status, data: fence.data };
            } else if (
              fence.data.outcome === 'cancelled' &&
              fence.data.operationId === operationId &&
              fence.data.kind === 'refund' &&
              fence.data.status === 'failed'
            ) {
              if (
                fence.data.idempotentReplay &&
                fence.data.failureCode === 'CANCELLED_FOR_OVERRIDE'
              ) {
                await this.markCancelledByWalletFence({
                  id,
                  paymentId: payment.id,
                  approvedByUserId: row.approvedByUserId ?? null,
                  failureCode: 'CANCELLED_FOR_OVERRIDE',
                });
                return;
              }
              await this.markFailedTerminal({
                id,
                paymentId: payment.id,
                orderId: payment.orderId,
                disputeResolutionId: row.disputeResolutionId ?? null,
                approvedByUserId: row.approvedByUserId ?? null,
                failureCode,
                failureReason,
              });
              return;
            } else {
              await this.restoreNeedsReview(id, fundingBlocked);
              return;
            }
          } else {
            // Uncertain fence outcome: keep reservation held for reconciliation.
            await this.restoreNeedsReview(id, fundingBlocked);
            return;
          }
        } else {
          // Non-dispute 409 (e.g. temporary Cash treasury shortfall): keep reservation held so the same operationId can resume.
          const verified = await this.wallet.getOperation(operationId);
          if (verified.outcome === 'ok') {
            result = verified;
          } else {
            await this.restoreNeedsReview(
              id,
              verified.outcome === 'missing' ? failureReason : fundingBlocked,
            );
            return;
          }
        }
      } else if (credit.outcome !== 'ok') {
        await this.restoreNeedsReview(id, fundingBlocked);
        return;
      } else {
        result = await this.wallet.getOperation(operationId);
      }
    }
    if (result.outcome !== 'ok') {
      await this.restoreNeedsReview(id, fundingBlocked);
      return;
    }
    const committed = result.data;
    if (
      committed.status === 'failed' &&
      committed.operationId === operationId &&
      committed.kind === 'refund'
    ) {
      if (committed.failureCode === 'CANCELLED_FOR_OVERRIDE') {
        await this.markCancelledByWalletFence({
          id,
          paymentId: payment.id,
          approvedByUserId: row.approvedByUserId ?? null,
          failureCode: 'CANCELLED_FOR_OVERRIDE',
        });
        return;
      }
      if (row.disputeResolutionId) {
        const failureCode = (
          typeof committed.failureCode === 'string' && committed.failureCode.trim()
            ? committed.failureCode.trim()
            : 'WALLET_OPERATION_FAILED'
        ).slice(0, 100);
        await this.markFailedTerminal({
          id,
          paymentId: payment.id,
          orderId: payment.orderId,
          disputeResolutionId: row.disputeResolutionId,
          approvedByUserId: row.approvedByUserId ?? null,
          failureCode,
          failureReason: `${failureCode}: Wallet marked refund operation as failed`,
        });
        return;
      }
      await this.restoreNeedsReview(id, fundingBlocked);
      return;
    }
    if (!this.isVerifiedWalletCommit(committed, operationId, row.amountVnd)) {
      await this.restoreNeedsReview(id, fundingBlocked);
      return;
    }
    await this.completeRefundFromWalletCommit(
      payment.id,
      id,
      committed.transferId,
    );
  }

  /**
   * Coordinates with Order before superseding a `needs_review` dispute resolution.
   * Verifies Wallet state and atomically closes any non-terminal refund reservation
   * only when safe; reconciles immediately if Wallet already committed.
   */
  async cancelDisputeRefundForOverride(
    resolutionId: string,
    params: { orderId: string; adminUserId: string; reason: string },
  ): Promise<DisputeRefundOverrideCheckResult> {
    if (!params.reason.trim()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Override reason is required',
      );
    }
    const existing = await this.database.client.refund.findUnique({
      where: { disputeResolutionId: resolutionId },
      include: { payment: true },
    });
    if (!existing) {
      return {
        safeToOverride: true,
        outcome: 'no_refund',
        refundId: null,
        refundStatus: null,
        paymentId: null,
        paymentStatus: null,
        refundAmountVnd: null,
      };
    }
    if (existing.payment.orderId !== params.orderId) {
      conflict('Dispute resolution refund does not belong to this order');
    }
    if (existing.status === 'completed') {
      return {
        safeToOverride: false,
        outcome: 'already_completed',
        refundId: existing.id,
        refundStatus: 'completed',
        paymentId: existing.paymentId,
        paymentStatus: existing.payment.status,
        refundAmountVnd: existing.amountVnd.toString(),
      };
    }
    if (
      existing.status === 'processing' &&
      Date.now() - existing.updatedAt.getTime() < PROCESSING_STALE_MS
    ) {
      return {
        safeToOverride: false,
        outcome: 'refund_in_progress',
        refundId: existing.id,
        refundStatus: 'processing',
        paymentId: existing.paymentId,
        paymentStatus: existing.payment.status,
        refundAmountVnd: existing.amountVnd.toString(),
      };
    }

    let walletFenced = false;
    if (existing.approvedAt) {
      const operationId = `${existing.paymentId}:refund:${existing.id}`;
      // Atomic cancellation handshake at Wallet: never rely on getOperation === 'missing'
      // or stale processing timeout, because an in-flight refundCredit could still commit late.
      const fence = await this.wallet.cancelRefundOperation({
        paymentId: existing.paymentId,
        refundId: existing.id,
        customerUserId: existing.payment.customerUserId,
        amount: existing.amountVnd.toString(),
        actorUserId: params.adminUserId,
        reason: params.reason.trim(),
        failureCode: 'CANCELLED_FOR_OVERRIDE',
      });
      if (fence.outcome !== 'ok') {
        return {
          safeToOverride: false,
          outcome: 'wallet_uncertain',
          refundId: existing.id,
          refundStatus: existing.status,
          paymentId: existing.paymentId,
          paymentStatus: existing.payment.status,
          refundAmountVnd: existing.amountVnd.toString(),
        };
      }
      if (fence.data.outcome === 'already_completed') {
        if (
          this.isVerifiedWalletCommit(fence.data, operationId, existing.amountVnd)
        ) {
          const reconciled = await this.completeRefundFromWalletCommit(
            existing.paymentId,
            existing.id,
            fence.data.transferId,
          );
          return {
            safeToOverride: false,
            outcome: 'already_completed',
            refundId: existing.id,
            refundStatus: 'completed',
            paymentId: existing.paymentId,
            paymentStatus:
              reconciled?.paymentStatus ?? existing.payment.status,
            refundAmountVnd: existing.amountVnd.toString(),
          };
        }
        return {
          safeToOverride: false,
          outcome: 'wallet_uncertain',
          refundId: existing.id,
          refundStatus: existing.status,
          paymentId: existing.paymentId,
          paymentStatus: existing.payment.status,
          refundAmountVnd: existing.amountVnd.toString(),
        };
      }
      if (
        fence.data.outcome !== 'cancelled' ||
        fence.data.operationId !== operationId ||
        fence.data.kind !== 'refund' ||
        fence.data.status !== 'failed'
      ) {
        return {
          safeToOverride: false,
          outcome: 'wallet_uncertain',
          refundId: existing.id,
          refundStatus: existing.status,
          paymentId: existing.paymentId,
          paymentStatus: existing.payment.status,
          refundAmountVnd: existing.amountVnd.toString(),
        };
      }
      walletFenced = true;
    }

    if (['failed', 'cancelled'].includes(existing.status)) {
      return {
        safeToOverride: true,
        outcome: 'already_terminal',
        refundId: existing.id,
        refundStatus: existing.status,
        paymentId: existing.paymentId,
        paymentStatus: existing.payment.status,
        refundAmountVnd: existing.amountVnd.toString(),
      };
    }

    return this.database.client.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, existing.paymentId);
      if (!locked) missing();
      const current = await tx.refund.findUniqueOrThrow({
        where: { id: existing.id },
      });
      if (current.status === 'completed') {
        return {
          safeToOverride: false,
          outcome: 'already_completed' as const,
          refundId: current.id,
          refundStatus: 'completed',
          paymentId: locked.id,
          paymentStatus: locked.status,
          refundAmountVnd: current.amountVnd.toString(),
        };
      }
      if (!walletFenced && current.approvedAt) {
        return {
          safeToOverride: false,
          outcome: 'wallet_uncertain' as const,
          refundId: current.id,
          refundStatus: current.status,
          paymentId: locked.id,
          paymentStatus: locked.status,
          refundAmountVnd: current.amountVnd.toString(),
        };
      }
      if (['failed', 'cancelled'].includes(current.status)) {
        return {
          safeToOverride: true,
          outcome: 'already_terminal' as const,
          refundId: current.id,
          refundStatus: current.status,
          paymentId: locked.id,
          paymentStatus: locked.status,
          refundAmountVnd: current.amountVnd.toString(),
        };
      }
      const now = new Date();
      const cancelled = await tx.refund.update({
        where: { id: current.id },
        data: {
          status: 'cancelled',
          ...(current.approvedByUserId
            ? {}
            : { rejectedByUserId: params.adminUserId, rejectedAt: now }),
          decisionNote: params.reason.trim().slice(0, 2000),
          failureReason: 'SUPERSEDED_BY_ADMIN_OVERRIDE',
          updatedAt: now,
        },
      });
      await this.audit.record(tx, {
        actorUserId: params.adminUserId,
        action: 'dispute.refund.cancelled_for_override',
        entityType: 'refund',
        entityId: current.id,
        before: serialize(current),
        after: serialize(cancelled),
        reason: params.reason.trim(),
      });
      return {
        safeToOverride: true,
        outcome: 'cancelled' as const,
        refundId: cancelled.id,
        refundStatus: cancelled.status,
        paymentId: locked.id,
        paymentStatus: locked.status,
        refundAmountVnd: cancelled.amountVnd.toString(),
      };
    });
  }

  async resumeApproved(limit = 20): Promise<number> {
    const staleCutoff = new Date(Date.now() - PROCESSING_STALE_MS);
    const rows = await this.database.client.refund.findMany({
      where: {
        approvedAt: { not: null },
        OR: [
          { status: 'needs_review' },
          { status: 'processing', updatedAt: { lte: staleCutoff } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    for (const row of rows) await this.execute(row.id);
    return rows.length;
  }
}
