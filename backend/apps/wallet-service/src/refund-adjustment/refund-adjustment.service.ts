import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletLedgerService } from '../wallet-ledger/wallet-ledger.service.js';
import { RefundCreditDto } from './dto/refund-credit.dto.js';
import { WalletAdjustmentDto } from './dto/wallet-adjustment.dto.js';

@Injectable()
export class RefundAdjustmentService {
  constructor(private readonly ledger: WalletLedgerService) {}
  async refund(userId: string, dto: RefundCreditDto) {
    const original = await this.ledger.prisma.walletTransfer.findFirst({ where: { operationId: { startsWith: `${dto.paymentId}:` }, kind: 'payment' } });
    if (!original) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Original payment transfer not found');
    const entries = await this.ledger.prisma.walletTransaction.findMany({ where: { transferId: original.id } });
    const customerEntry = entries.find((entry) => entry.direction === 'debit');
    const sources = entries.filter((entry) => entry.direction === 'credit');
    if (!customerEntry || sources.length === 0) throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Original payment postings are incomplete');
    const customerWallet = await this.ledger.prisma.wallet.findUnique({ where: { id: customerEntry.walletId } });
    if (!customerWallet || customerWallet.userId !== userId) throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Refund owner does not match original payment');
    const amount = BigInt(dto.amount);
    const alreadyRefunded = await this.ledger.prisma.walletTransfer.aggregate({ where: { kind: 'refund', operationId: { startsWith: `${dto.paymentId}:` } }, _sum: { totalAmount: true } });
    if ((alreadyRefunded._sum.totalAmount ?? 0n) + amount > customerEntry.amount) throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Refund exceeds original payment amount');
    const sourceTotal = sources.reduce((sum, entry) => sum + entry.amount, 0n);
    let remaining = amount;
    const postings: Array<{ walletId: string; direction: 'debit'|'credit'; amount: bigint; type: string; referenceId: string }> = [];
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i]!;
      const share = i === sources.length - 1 ? remaining : (amount * source.amount) / sourceTotal;
      remaining -= share;
      if (share) postings.push({ walletId: source.walletId, direction: 'debit', amount: share, type: 'refund_recovery', referenceId: dto.paymentId });
    }
    postings.push({ walletId: customerWallet.id, direction: 'credit', amount, type: 'refund_credit', referenceId: dto.paymentId });
    try { return await this.ledger.createBalancedTransfer({ operationId: `${dto.paymentId}:refund:${dto.refundId}`, idempotencyKey: `refund:${dto.refundId}`, kind: 'refund', postings }); }
    catch (error) { throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, `Refund needs review because funds could not be recovered: ${(error as Error).message}`); }
  }
  async adjust(userId: string, dto: WalletAdjustmentDto) {
    const [wallet, platform] = await Promise.all([this.ledger.prisma.wallet.findUnique({ where: { userId } }), this.ledger.prisma.wallet.findUnique({ where: { systemKey: 'PLATFORM_FEES' } })]);
    if (!wallet || !platform) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Adjustment wallet not found');
    return this.ledger.createBalancedTransfer({ operationId: `adjustment:${dto.idempotencyKey}`, idempotencyKey: `adjust:${dto.idempotencyKey}`, kind: 'adjustment', postings: dto.direction === 'credit'
      ? [{ walletId: platform.id, direction: 'debit', amount: BigInt(dto.amount), type: 'adjustment_funding', referenceId: dto.idempotencyKey }, { walletId: wallet.id, direction: 'credit', amount: BigInt(dto.amount), type: 'admin_adjustment', referenceId: dto.reason }]
      : [{ walletId: wallet.id, direction: 'debit', amount: BigInt(dto.amount), type: 'admin_adjustment', referenceId: dto.reason }, { walletId: platform.id, direction: 'credit', amount: BigInt(dto.amount), type: 'adjustment_recovery', referenceId: dto.idempotencyKey }] });
  }
}
