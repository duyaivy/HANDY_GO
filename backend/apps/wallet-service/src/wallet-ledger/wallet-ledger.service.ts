import { Injectable } from '@nestjs/common';
import { WalletPrismaService } from './wallet-prisma.service.js';

@Injectable()
export class WalletLedgerService {
  constructor(readonly prisma: WalletPrismaService) {}

  async getOperation(operationId: string) {
    const transfer = await this.prisma.walletTransfer.findUnique({ where: { operationId } });
    if (!transfer) return null;
    return { operationId, transferId: transfer.id, kind: transfer.kind, status: transfer.status, amount: transfer.totalAmount.toString(), createdAt: transfer.createdAt };
  }

  async createBalancedTransfer(input: {
    operationId: string;
    idempotencyKey: string;
    kind: string;
    postings: Array<{ walletId: string; direction: 'debit' | 'credit'; amount: bigint; type: string; referenceId?: string }>;
  }) {
    if (input.postings.length < 2 || input.postings.some((posting) => posting.amount <= 0n)) {
      throw new Error('A balanced transfer requires at least two positive postings');
    }
    const debits = input.postings.filter((posting) => posting.direction === 'debit').reduce((sum, posting) => sum + posting.amount, 0n);
    const credits = input.postings.filter((posting) => posting.direction === 'credit').reduce((sum, posting) => sum + posting.amount, 0n);
    if (debits !== credits) throw new Error('Transfer debit and credit totals must match');
    const fingerprint = JSON.stringify({
      operationId: input.operationId,
      kind: input.kind,
      postings: input.postings
        .map((posting) => ({
          walletId: posting.walletId,
          direction: posting.direction,
          amount: posting.amount.toString(),
          type: posting.type,
          referenceId: posting.referenceId ?? null,
        }))
        .sort((a, b) => `${a.walletId}:${a.direction}`.localeCompare(`${b.walletId}:${b.direction}`)),
    });

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.walletTransfer.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        const metadata = existing.metadata;
        const existingFingerprint =
          metadata && typeof metadata === 'object' && !Array.isArray(metadata) && 'fingerprint' in metadata
            ? metadata.fingerprint
            : undefined;
        if (existing.operationId !== input.operationId || existing.kind !== input.kind || existingFingerprint !== fingerprint) {
          throw new Error('Idempotency key is already used by another operation');
        }
        return { ...existing, idempotentReplay: true };
      }
      const walletIds = [...new Set(input.postings.map((posting) => posting.walletId))].sort();
      for (const walletId of walletIds) {
        await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${walletId}::uuid FOR UPDATE`;
      }
      const transfer = await tx.walletTransfer.create({ data: {
        operationId: input.operationId, idempotencyKey: input.idempotencyKey, kind: input.kind,
        totalAmount: debits, status: 'completed', metadata: { fingerprint },
      } });
      for (const posting of input.postings) {
        const wallet = await tx.wallet.findUnique({ where: { id: posting.walletId } });
        if (!wallet || wallet.status !== 'active') throw new Error('Wallet is missing or inactive');
        if (posting.direction === 'debit' && wallet.balance - wallet.reservedBalance < posting.amount) throw new Error('Insufficient available balance');
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: posting.direction === 'debit' ? { decrement: posting.amount } : { increment: posting.amount } } });
        await tx.walletTransaction.create({ data: {
          walletId: wallet.id, transferId: transfer.id, type: posting.type, direction: posting.direction,
          amount: posting.amount, operationId: input.operationId, referenceId: posting.referenceId,
        } });
        await tx.outboxEvent.create({ data: {
          eventType: posting.direction === 'debit' ? 'wallet.debited' : 'wallet.credited',
          payload: { eventId: `${transfer.id}:${wallet.id}:${posting.direction}`, operationId: input.operationId, transferId: transfer.id, walletId: wallet.id, amount: posting.amount.toString(), type: posting.type, referenceId: posting.referenceId ?? null },
        } });
      }
      if (input.kind === 'refund') {
        await tx.outboxEvent.create({ data: { eventType: 'wallet.refunded', payload: { eventId: `wallet.refunded:${transfer.id}`, operationId: input.operationId, transferId: transfer.id, amount: debits.toString() } } });
      }
      if (input.kind === 'adjustment') {
        await tx.outboxEvent.create({ data: { eventType: 'wallet.balance.adjusted', payload: { eventId: `wallet.balance.adjusted:${transfer.id}`, operationId: input.operationId, transferId: transfer.id, amount: debits.toString() } } });
      }
      return { ...transfer, idempotentReplay: false };
    }, { isolationLevel: 'Serializable' });
  }
}
