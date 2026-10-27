import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletLedgerService } from '../wallet-ledger/wallet-ledger.service.js';
import { RefundCreditDto } from './dto/refund-credit.dto.js';
import { WalletAdjustmentDto } from './dto/wallet-adjustment.dto.js';

@Injectable()
export class RefundAdjustmentService {
  constructor(private readonly ledger: WalletLedgerService) {}

  async refund(userId: string, dto: RefundCreditDto) {
    const amount = BigInt(dto.amount);
    const operationId = `${dto.paymentId}:refund:${dto.refundId}`;
    const idempotencyKey = `refund:${dto.refundId}`;

    return this.ledger.prisma.$transaction(async (tx) => {
      // --- Replay check (J fix: also verify owner) ---
      const existing = await tx.walletTransfer.findUnique({ where: { idempotencyKey } });
      if (existing) {
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

      // --- Find original payment and lock it (A fix: lock prevents concurrent over-refund) ---
      const original = await tx.walletTransfer.findFirst({ where: { operationId: { startsWith: `${dto.paymentId}:` }, kind: 'payment' } });
      if (!original) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Original payment transfer not found');

      // Lock the payment transfer row to serialize concurrent refunds on the same payment
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallet_transfers" WHERE id = ${original.id}::uuid FOR UPDATE`;

      const entries = await tx.walletTransaction.findMany({ where: { transferId: original.id } });
      const customerEntry = entries.find((entry) => entry.direction === 'debit');
      const sources = entries.filter((entry) => entry.direction === 'credit');
      if (!customerEntry || sources.length === 0) throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Original payment postings are incomplete');

      const customerWallet = await tx.wallet.findUnique({ where: { id: customerEntry.walletId } });
      if (!customerWallet || customerWallet.userId !== userId) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Refund owner does not match original payment');

      // --- Cap check inside TX (A fix) ---
      const alreadyRefunded = await tx.walletTransfer.aggregate({ where: { kind: 'refund', operationId: { startsWith: `${dto.paymentId}:` } }, _sum: { totalAmount: true } });
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
        throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, `Refund needs review because funds could not be recovered: ${(error as Error).message}`);
      }
    }, { isolationLevel: 'Serializable' });
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
