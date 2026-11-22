import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletLedgerService } from '../wallet-ledger/wallet-ledger.service.js';
import { CancelRefundOperationDto } from './dto/cancel-refund-operation.dto.js';
import { RefundCreditDto } from './dto/refund-credit.dto.js';
import { WalletAdjustmentDto } from './dto/wallet-adjustment.dto.js';

/** Actor hệ thống cho audit do wallet tự ghi (không có admin thao tác). */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
export const REFUND_CANCELLED_FAILURE_CODE = 'CANCELLED_FOR_OVERRIDE';

export class RefundNeedsReviewException extends AppException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, message);
  }
}

export interface CancelRefundOperationResult {
  outcome: 'cancelled' | 'already_completed';
  operationId: string;
  transferId: string;
  kind: string;
  status: string;
  amount: string;
  failureCode?: string;
  idempotentReplay: boolean;
}

@Injectable()
export class RefundAdjustmentService {
  constructor(private readonly ledger: WalletLedgerService) {}

  private isRetryableSerializationError(error: unknown): boolean {
    const detail = error as {
      code?: string;
      meta?: {
        code?: string;
        driverAdapterError?: { cause?: { originalCode?: string } };
      };
    } | null;
    const sqlState =
      detail?.meta?.code ??
      detail?.meta?.driverAdapterError?.cause?.originalCode;
    return (
      detail?.code === 'P2034' ||
      detail?.code === 'P2002' ||
      (detail?.code === 'P2010' &&
        (sqlState === '40001' || sqlState === '40P01'))
    );
  }

  private async runSerializableWithRetry<T>(
    work: (
      tx: Parameters<Parameters<WalletLedgerService['prisma']['$transaction']>[0]>[0],
    ) => Promise<T>,
  ): Promise<T> {
    for (let retry = 0; ; retry++) {
      try {
        return await this.ledger.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (retry >= 4 || !this.isRetryableSerializationError(error)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** retry));
      }
    }
  }

  private extractFailureCode(metadata: unknown): string {
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).failureCode === 'string' &&
      ((metadata as Record<string, unknown>).failureCode as string).trim()
    ) {
      return ((metadata as Record<string, unknown>).failureCode as string).trim();
    }
    return REFUND_CANCELLED_FAILURE_CODE;
  }

  /**
   * Linearizable cancellation fence for a refund operationId.
   * Serializes with `refundTx` via the same payment-level advisory lock and unique
   * `wallet_transfers(operation_id, idempotency_key)` constraints so an in-flight
   * `refundCredit` and an override/failure cancellation can never both commit.
   */
  async cancelRefundOperation(
    dto: CancelRefundOperationDto,
  ): Promise<CancelRefundOperationResult> {
    const operationId = `${dto.paymentId}:refund:${dto.refundId}`;
    const idempotencyKey = `refund:${dto.refundId}`;
    const reason = dto.reason.trim().slice(0, 500);
    if (!reason) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Cancellation reason is required',
      );
    }
    const failureCode = dto.failureCode ?? REFUND_CANCELLED_FAILURE_CODE;

    return this.runSerializableWithRetry(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.paymentId}))::text`;

      const existing =
        (await tx.walletTransfer.findUnique({ where: { operationId } })) ??
        (await tx.walletTransfer.findUnique({ where: { idempotencyKey } }));

      if (existing) {
        if (
          existing.operationId !== operationId ||
          existing.idempotencyKey !== idempotencyKey ||
          existing.kind !== 'refund'
        ) {
          throw new AppException(
            HttpStatus.CONFLICT,
            ERROR_CODES.CONFLICT,
            'Refund operation identity mismatch',
          );
        }
        if (existing.status === 'completed') {
          return {
            outcome: 'already_completed',
            operationId: existing.operationId,
            transferId: existing.id,
            kind: existing.kind,
            status: existing.status,
            amount: existing.totalAmount.toString(),
            idempotentReplay: true,
          };
        }
        if (existing.status === 'failed') {
          return {
            outcome: 'cancelled',
            operationId: existing.operationId,
            transferId: existing.id,
            kind: existing.kind,
            status: existing.status,
            amount: existing.totalAmount.toString(),
            failureCode: this.extractFailureCode(existing.metadata),
            idempotentReplay: true,
          };
        }
        throw new AppException(
          HttpStatus.CONFLICT,
          ERROR_CODES.CONFLICT,
          `Refund operation cannot be cancelled from status ${existing.status}`,
        );
      }

      const tombstone = await tx.walletTransfer.create({
        data: {
          operationId,
          idempotencyKey,
          kind: 'refund',
          totalAmount: BigInt(dto.amount),
          status: 'failed',
          metadata: {
            failureCode,
            cancelledForOverride:
              failureCode === REFUND_CANCELLED_FAILURE_CODE,
            paymentId: dto.paymentId,
            refundId: dto.refundId,
            customerUserId: dto.customerUserId,
            amount: dto.amount,
            reason,
            cancelledAt: new Date().toISOString(),
          },
        },
      });
      await tx.walletAuditLog.create({
        data: {
          actorId: dto.actorUserId ?? SYSTEM_ACTOR_ID,
          targetUserId: dto.customerUserId,
          action: 'wallet.refund.cancelled',
          reason,
          transferId: tombstone.id,
          metadata: {
            operationId,
            paymentId: dto.paymentId,
            refundId: dto.refundId,
            failureCode,
          },
        },
      });
      return {
        outcome: 'cancelled',
        operationId: tombstone.operationId,
        transferId: tombstone.id,
        kind: tombstone.kind,
        status: tombstone.status,
        amount: tombstone.totalAmount.toString(),
        failureCode,
        idempotentReplay: false,
      };
    });
  }

  private async refundTx(userId: string, dto: RefundCreditDto) {
    const amount = BigInt(dto.amount);
    const operationId = `${dto.paymentId}:refund:${dto.refundId}`;
    const idempotencyKey = `refund:${dto.refundId}`;

    return this.runSerializableWithRetry(async (tx) => {
      // Serialize all refunds, replays, and cancellation fences for this payment.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.paymentId}))::text`;
      // --- Fence & Replay check (J fix: also verify owner) ---
      const existing =
        (await tx.walletTransfer.findUnique({ where: { idempotencyKey } })) ??
        (await tx.walletTransfer.findUnique({ where: { operationId } }));
      if (existing) {
        if (existing.status === 'failed') {
          throw new AppException(
            HttpStatus.CONFLICT,
            ERROR_CODES.CONFLICT,
            'Refund operation was cancelled',
          );
        }
        if (existing.status !== 'completed') {
          throw new AppException(
            HttpStatus.CONFLICT,
            ERROR_CODES.CONFLICT,
            `Refund operation is in non-completed status ${existing.status}`,
          );
        }
        const metadata = existing.metadata as Record<string, unknown> | null;
        if ((dto.method === 'cash' && (metadata?.cashGrossAmount !== dto.grossAmount || metadata?.customerUserId !== userId)) ||
            (dto.method !== 'cash' && metadata?.cashGrossAmount !== undefined)) {
          throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.CONFLICT, 'Refund funding payload changed');
        }
        if (existing.operationId !== operationId || existing.totalAmount !== amount || existing.kind !== 'refund') {
          throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Refund retry payload does not match the original operation');
        }
        // R01: verify owner on replay
        const replayEntries = await tx.walletTransaction.findMany({ where: { transferId: existing.id } });
        const replayCreditEntry = replayEntries.find((e) => e.direction === 'credit');
        if (replayCreditEntry) {
          const replayWallet = await tx.wallet.findUnique({ where: { id: replayCreditEntry.walletId } });
          if (!replayWallet || replayWallet.userId !== userId) {
            throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Refund does not belong to this user');
          }
        }
        return { ...existing, idempotentReplay: true };
      }

      if (dto.method === 'cash') {
        if (process.env.NODE_ENV === 'production')
          throw new RefundNeedsReviewException('Cash refund funding is sandbox-only pending Finance approval');
        if (!dto.grossAmount) throw new RefundNeedsReviewException('Cash refund requires an authorized gross amount');
        const previous = await tx.walletTransfer.findMany({
          where: {
            kind: 'refund',
            status: 'completed',
            operationId: { startsWith: `${dto.paymentId}:refund:` },
          },
        });
        for (const row of previous) {
          const metadata = row.metadata as Record<string, unknown> | null;
          if (metadata?.cashGrossAmount !== dto.grossAmount || metadata?.customerUserId !== userId)
            throw new RefundNeedsReviewException('Cash funding snapshot does not match');
        }
        if (previous.reduce((sum, row) => sum + row.totalAmount, 0n) + amount > BigInt(dto.grossAmount))
          throw new RefundNeedsReviewException('Refund exceeds original cash amount');
        const originalPoint = await tx.walletTransfer.findFirst({ where: { kind: 'payment', status: 'completed', operationId: { startsWith: `${dto.paymentId}:` } } });
        if (originalPoint) throw new RefundNeedsReviewException('Cash refund contradicts existing Point settlement');
        const customer = await tx.wallet.findUnique({ where: { userId } });
        const fund = await tx.wallet.findUnique({ where: { systemKey: 'PLATFORM_FEES' } });
        if (!customer || !fund || customer.id === fund.id) throw new RefundNeedsReviewException('Refund funding wallets unavailable');
        try {
          const transfer = await this.ledger.createBalancedTransferInTx(tx, { operationId, idempotencyKey, kind: 'refund', postings: [
            { walletId: fund.id, direction: 'debit', amount, type: 'refund_recovery', referenceId: dto.paymentId },
            { walletId: customer.id, direction: 'credit', amount, type: 'refund_credit', referenceId: dto.paymentId },
          ] });
          const metadata = transfer.metadata as Record<string, string>;
          await tx.walletTransfer.update({ where: { id: transfer.id }, data: { metadata: { ...metadata, cashGrossAmount: dto.grossAmount, customerUserId: userId } } });
          await tx.walletAuditLog.create({ data: { actorId: SYSTEM_ACTOR_ID, targetUserId: userId, action: 'wallet.cash_refund', reason: 'Approved Payment refund funded from PLATFORM_FEES', transferId: transfer.id, metadata: { paymentId: dto.paymentId, refundId: dto.refundId, grossAmount: dto.grossAmount } } });
          return transfer;
        } catch (error) {
          if (this.isRetryableSerializationError(error)) throw error;
          throw new RefundNeedsReviewException('Cash refund funding unavailable');
        }
      }

      // --- Find original payment and lock it (A fix: lock prevents concurrent over-refund) ---
      const original = await tx.walletTransfer.findFirst({ where: { operationId: { startsWith: `${dto.paymentId}:` }, kind: 'payment', status: 'completed' } });
      if (!original) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Original payment transfer not found');

      // Lock the payment transfer row to serialize concurrent refunds on the same payment
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallet_transfers" WHERE id = ${original.id}::uuid FOR UPDATE`;

      const entries = await tx.walletTransaction.findMany({ where: { transferId: original.id }, orderBy: { walletId: 'asc' } });
      const customerEntry = entries.find((entry) => entry.direction === 'debit');
      const sources = entries.filter((entry) => entry.direction === 'credit');
      if (!customerEntry || sources.length === 0) throw new RefundNeedsReviewException('Refund needs review: original payment postings/sources are incomplete');

      const customerWallet = await tx.wallet.findUnique({ where: { id: customerEntry.walletId } });
      if (!customerWallet || customerWallet.userId !== userId) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Refund owner does not match original payment');

      // --- Cap check inside TX (A fix) ---
      const alreadyRefunded = await tx.walletTransfer.aggregate({
        where: {
          kind: 'refund',
          status: 'completed',
          operationId: { startsWith: `${dto.paymentId}:` },
        },
        _sum: { totalAmount: true },
      });
      if ((alreadyRefunded._sum.totalAmount ?? 0n) + amount > customerEntry.amount) throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Refund exceeds original payment amount');

      // --- Rounding allocation (G fix: cumulative per-source) ---
      const sourceTotal = sources.reduce((sum, e) => sum + e.amount, 0n);
      const totalRefundedAfter = (alreadyRefunded._sum.totalAmount ?? 0n) + amount;

      const sourceWalletIds = sources.map((s) => s.walletId);
      const previousRecoveryRows = await tx.walletTransaction.groupBy({
        by: ['walletId'],
        where: {
          walletId: { in: sourceWalletIds },
          type: 'refund_recovery',
          referenceId: dto.paymentId,
        },
        _sum: { amount: true },
      });
      const previousRecoveryMap = new Map<string, bigint>(
        previousRecoveryRows.map((r) => [r.walletId, r._sum.amount ?? 0n]),
      );

      // Compute cumulative target recovery for each source based on totalRefundedAfter
      const cumulativeTargets: bigint[] = [];
      let runningTotal = 0n;
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i]!;
        if (i === sources.length - 1) {
          cumulativeTargets.push(totalRefundedAfter - runningTotal);
        } else {
          const target = (totalRefundedAfter * source.amount) / sourceTotal;
          cumulativeTargets.push(target);
          runningTotal += target;
        }
      }

      const postings: Array<{ walletId: string; direction: 'debit' | 'credit'; amount: bigint; type: string; referenceId: string }> = [];
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i]!;
        const cumulativeTarget = cumulativeTargets[i]!;
        const alreadyRecoveredFromSource = previousRecoveryMap.get(source.walletId) ?? 0n;
        const thisRefundRecovery = cumulativeTarget - alreadyRecoveredFromSource;
        if (thisRefundRecovery > 0n) {
          postings.push({ walletId: source.walletId, direction: 'debit', amount: thisRefundRecovery, type: 'refund_recovery', referenceId: dto.paymentId });
        }
      }
      postings.push({ walletId: customerWallet.id, direction: 'credit', amount, type: 'refund_credit', referenceId: dto.paymentId });

      try {
        return await this.ledger.createBalancedTransferInTx(tx, { operationId, idempotencyKey, kind: 'refund', postings });
      } catch (error) {
        if (this.isRetryableSerializationError(error)) throw error;
        throw new RefundNeedsReviewException(`Refund needs review because funds could not be recovered: ${(error as Error).message}`);
      }
    });
  }

  /**
   * Refund thiếu nguồn thu hồi → needs_review: không tạo Point, không dùng Platform bù.
   * Giao dịch refund bị rollback; bản ghi review (audit + outbox) được ghi riêng, idempotent theo refundId.
   */
  private async recordRefundNeedsReview(userId: string, dto: RefundCreditDto, reason: string) {
    const prisma = this.ledger.prisma;
    const eventId = `wallet.refund.needs_review:${dto.refundId}`;
    const existing = await prisma.outboxEvent.findFirst({ where: { eventType: 'wallet.refund.needs_review', payload: { path: ['eventId'], equals: eventId } } });
    if (existing) return;
    await prisma.$transaction([
      prisma.walletAuditLog.create({
        data: {
          actorId: SYSTEM_ACTOR_ID,
          targetUserId: userId,
          action: 'wallet.refund.needs_review',
          reason: reason.slice(0, 500),
          metadata: { paymentId: dto.paymentId, refundId: dto.refundId, amount: dto.amount },
        },
      }),
      prisma.outboxEvent.create({
        data: {
          eventType: 'wallet.refund.needs_review',
          payload: { eventId, userId, paymentId: dto.paymentId, refundId: dto.refundId, amount: dto.amount, reason: reason.slice(0, 200) },
        },
      }),
    ]);
  }

  async refund(userId: string, dto: RefundCreditDto) {
    try {
      return await this.refundTx(userId, dto);
    } catch (error) {
      if (error instanceof RefundNeedsReviewException) {
        await this.recordRefundNeedsReview(userId, dto, error.message);
      }
      throw error;
    }
  }

  listAuditLogs(userId: string, skip: number, take: number) {
    return this.ledger.prisma.walletAuditLog.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async adjust(userId: string, dto: WalletAdjustmentDto, actorId: string) {
    const [wallet, platform] = await Promise.all([this.ledger.prisma.wallet.findUnique({ where: { userId } }), this.ledger.prisma.wallet.findUnique({ where: { systemKey: 'PLATFORM_FEES' } })]);
    if (!wallet || !platform) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Adjustment wallet not found');

    // Validate reason length
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Adjustment reason is required');
    }
    if (dto.reason.length > 500) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Adjustment reason must not exceed 500 characters');
    }

    return this.ledger.createBalancedTransfer({
      operationId: `adjustment:${dto.idempotencyKey}`,
      idempotencyKey: `adjust:${dto.idempotencyKey}`,
      kind: 'adjustment',
      auditMeta: { actorId, targetUserId: userId, reason: dto.reason.trim() },
      postings: dto.direction === 'credit'
        ? [{ walletId: platform.id, direction: 'debit', amount: BigInt(dto.amount), type: 'adjustment_funding', referenceId: dto.idempotencyKey }, { walletId: wallet.id, direction: 'credit', amount: BigInt(dto.amount), type: 'admin_adjustment', referenceId: dto.idempotencyKey }]
        : [{ walletId: wallet.id, direction: 'debit', amount: BigInt(dto.amount), type: 'admin_adjustment', referenceId: dto.idempotencyKey }, { walletId: platform.id, direction: 'credit', amount: BigInt(dto.amount), type: 'adjustment_recovery', referenceId: dto.idempotencyKey }],
    });
  }
}
