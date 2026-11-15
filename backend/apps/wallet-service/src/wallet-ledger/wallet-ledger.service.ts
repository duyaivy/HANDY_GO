import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/wallet-client';
import { WalletPrismaService } from './wallet-prisma.service.js';

function operationFailureCode(metadata: Prisma.JsonValue): string | undefined {
  if (
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    typeof metadata.failureCode === 'string'
  )
    return metadata.failureCode;
  return undefined;
}

@Injectable()
export class WalletLedgerService {
  constructor(readonly prisma: WalletPrismaService) {}

  async getOperation(operationId: string) {
    const transfer = await this.prisma.walletTransfer.findUnique({
      where: { operationId },
    });
    if (!transfer) return null;
    return {
      operationId,
      transferId: transfer.id,
      kind: transfer.kind,
      status: transfer.status,
      amount: transfer.totalAmount.toString(),
      createdAt: transfer.createdAt,
      failureCode: operationFailureCode(transfer.metadata),
    };
  }

  async createBalancedTransfer(input: {
    operationId: string;
    idempotencyKey: string;
    kind: string;
    postings: Array<{
      walletId: string;
      direction: 'debit' | 'credit';
      amount: bigint;
      type: string;
      referenceId?: string;
    }>;
    auditMeta?: Record<string, unknown>;
    // Only customer payment debits have a terminal insufficient-funds contract.
    // Commission/refund/adjustment callers retain their existing retry behavior.
    persistInsufficientFunds?: boolean;
  }) {
    if (input.persistInsufficientFunds && input.kind !== 'payment') {
      throw new Error(
        'Terminal insufficient funds is only supported for payment debits',
      );
    }
    if (
      input.postings.length < 2 ||
      input.postings.some((posting) => posting.amount <= 0n)
    ) {
      throw new Error(
        'A balanced transfer requires at least two positive postings',
      );
    }
    const debits = input.postings
      .filter((posting) => posting.direction === 'debit')
      .reduce((sum, posting) => sum + posting.amount, 0n);
    const credits = input.postings
      .filter((posting) => posting.direction === 'credit')
      .reduce((sum, posting) => sum + posting.amount, 0n);
    if (debits !== credits)
      throw new Error('Transfer debit and credit totals must match');
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
        .sort((a, b) =>
          `${a.walletId}:${a.direction}`.localeCompare(
            `${b.walletId}:${b.direction}`,
          ),
        ),
    });

    // A concurrent replay can lose the unique insert or Serializable race. Retry
    // the entire transaction so it reads the winner's committed result.
    for (let retry = 0; ; retry++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.walletTransfer.findUnique({
              where: { idempotencyKey: input.idempotencyKey },
            });
            if (existing) {
              const metadata = existing.metadata;
              const existingFingerprint =
                metadata &&
                typeof metadata === 'object' &&
                !Array.isArray(metadata) &&
                'fingerprint' in metadata
                  ? metadata.fingerprint
                  : undefined;
              if (
                existing.operationId !== input.operationId ||
                existing.kind !== input.kind ||
                existingFingerprint !== fingerprint
              ) {
                throw new Error(
                  'Idempotency key is already used by another operation',
                );
              }
              return {
                ...existing,
                failureCode: operationFailureCode(existing.metadata),
                idempotentReplay: true,
              };
            }
            const walletIds = [
              ...new Set(input.postings.map((posting) => posting.walletId)),
            ].sort();
            for (const walletId of walletIds) {
              await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${walletId}::uuid FOR UPDATE`;
            }
            if (input.persistInsufficientFunds) {
              // Preflight every wallet before writing any balance, posting or event.
              // Returning (rather than throwing) commits the failed operation itself.
              let insufficient = false;
              for (const walletId of walletIds) {
                const wallet = await tx.wallet.findUnique({
                  where: { id: walletId },
                });
                if (!wallet || wallet.status !== 'active')
                  throw new Error('Wallet is missing or inactive');
                const required = input.postings
                  .filter(
                    (posting) =>
                      posting.walletId === walletId &&
                      posting.direction === 'debit',
                  )
                  .reduce((sum, posting) => sum + posting.amount, 0n);
                if (required > 0n && wallet.balance - wallet.reservedBalance < required)
                  insufficient = true;
              }
              if (insufficient) {
                const failed = await tx.walletTransfer.create({
                  data: {
                    operationId: input.operationId,
                    idempotencyKey: input.idempotencyKey,
                    kind: input.kind,
                    totalAmount: debits,
                    status: 'failed',
                    metadata: {
                      fingerprint,
                      failureCode: 'INSUFFICIENT_FUNDS',
                    },
                  },
                });
                return {
                  ...failed,
                  failureCode: 'INSUFFICIENT_FUNDS',
                  idempotentReplay: false,
                };
              }
            }
            const transfer = await tx.walletTransfer.create({
              data: {
                operationId: input.operationId,
                idempotencyKey: input.idempotencyKey,
                kind: input.kind,
                totalAmount: debits,
                status: 'completed',
                metadata: {
                  fingerprint,
                  ...(input.auditMeta ? { audit: input.auditMeta } : {}),
                } as Prisma.InputJsonValue,
              },
            });
            for (const posting of input.postings) {
              const wallet = await tx.wallet.findUnique({
                where: { id: posting.walletId },
              });
              if (!wallet || wallet.status !== 'active')
                throw new Error('Wallet is missing or inactive');
              if (
                posting.direction === 'debit' &&
                wallet.balance - wallet.reservedBalance < posting.amount
              )
                throw new Error('Insufficient available balance');
              await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                  balance:
                    posting.direction === 'debit'
                      ? { decrement: posting.amount }
                      : { increment: posting.amount },
                },
              });
              await tx.walletTransaction.create({
                data: {
                  walletId: wallet.id,
                  transferId: transfer.id,
                  type: posting.type,
                  direction: posting.direction,
                  amount: posting.amount,
                  operationId: input.operationId,
                  referenceId: posting.referenceId,
                },
              });
              await tx.outboxEvent.create({
                data: {
                  eventType:
                    posting.direction === 'debit'
                      ? 'wallet.debited'
                      : 'wallet.credited',
                  payload: {
                    eventId: `${transfer.id}:${wallet.id}:${posting.direction}`,
                    operationId: input.operationId,
                    transferId: transfer.id,
                    walletId: wallet.id,
                    amount: posting.amount.toString(),
                    type: posting.type,
                    referenceId: posting.referenceId ?? null,
                  },
                },
              });
            }
            if (input.kind === 'adjustment' && input.auditMeta) {
              const actorId = input.auditMeta.actorId;
              const targetUserId = input.auditMeta.targetUserId;
              const reason = input.auditMeta.reason;
              if (
                typeof actorId !== 'string' ||
                typeof targetUserId !== 'string' ||
                typeof reason !== 'string'
              ) {
                throw new Error('Adjustment audit metadata is incomplete');
              }
              await tx.walletAuditLog.create({
                data: {
                  actorId,
                  targetUserId,
                  action: 'wallet.adjustment',
                  reason,
                  transferId: transfer.id,
                  metadata: input.auditMeta as Prisma.InputJsonValue,
                },
              });
            }
            if (input.kind === 'refund') {
              await tx.outboxEvent.create({
                data: {
                  eventType: 'wallet.refunded',
                  payload: {
                    eventId: `wallet.refunded:${transfer.id}`,
                    operationId: input.operationId,
                    transferId: transfer.id,
                    amount: debits.toString(),
                  },
                },
              });
            }
            if (input.kind === 'adjustment') {
              await tx.outboxEvent.create({
                data: {
                  eventType: 'wallet.balance.adjusted',
                  payload: {
                    eventId: `wallet.balance.adjusted:${transfer.id}`,
                    operationId: input.operationId,
                    transferId: transfer.id,
                    amount: debits.toString(),
                  },
                },
              });
            }
            return {
              ...transfer,
              failureCode: undefined,
              idempotentReplay: false,
            };
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
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
        const retryable =
          detail?.code === 'P2034' ||
          detail?.code === 'P2002' ||
          (detail?.code === 'P2010' &&
            (sqlState === '40001' || sqlState === '40P01'));
        if (retry >= 4 || !retryable) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** retry));
      }
    }
  }

  async createBalancedTransferInTx(
    tx: Parameters<Parameters<WalletPrismaService['$transaction']>[0]>[0],
    input: {
      operationId: string;
      idempotencyKey: string;
      kind: string;
      postings: Array<{ walletId: string; direction: 'debit' | 'credit'; amount: bigint; type: string; referenceId?: string }>;
    },
  ) {
    if (input.postings.length < 2 || input.postings.some((p) => p.amount <= 0n)) {
      throw new Error('A balanced transfer requires at least two positive postings');
    }
    const debits = input.postings.filter((p) => p.direction === 'debit').reduce((s, p) => s + p.amount, 0n);
    const credits = input.postings.filter((p) => p.direction === 'credit').reduce((s, p) => s + p.amount, 0n);
    if (debits !== credits) throw new Error('Transfer debit and credit totals must match');
    const fingerprint = JSON.stringify({
      operationId: input.operationId,
      kind: input.kind,
      postings: input.postings
        .map((p) => ({ walletId: p.walletId, direction: p.direction, amount: p.amount.toString(), type: p.type, referenceId: p.referenceId ?? null }))
        .sort((a, b) => `${a.walletId}:${a.direction}`.localeCompare(`${b.walletId}:${b.direction}`)),
    });
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
    const walletIds = [...new Set(input.postings.map((p) => p.walletId))].sort();
    for (const walletId of walletIds) {
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${walletId}::uuid FOR UPDATE`;
    }
    const transfer = await tx.walletTransfer.create({
      data: { operationId: input.operationId, idempotencyKey: input.idempotencyKey, kind: input.kind, totalAmount: debits, status: 'completed', metadata: { fingerprint } },
    });
    for (const posting of input.postings) {
      const wallet = await tx.wallet.findUnique({ where: { id: posting.walletId } });
      if (!wallet || wallet.status !== 'active') throw new Error('Wallet is missing or inactive');
      if (posting.direction === 'debit' && wallet.balance - wallet.reservedBalance < posting.amount) throw new Error('Insufficient available balance');
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: posting.direction === 'debit' ? { decrement: posting.amount } : { increment: posting.amount } } });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, transferId: transfer.id, type: posting.type, direction: posting.direction, amount: posting.amount, operationId: input.operationId, referenceId: posting.referenceId },
      });
      await tx.outboxEvent.create({
        data: {
          eventType: posting.direction === 'debit' ? 'wallet.debited' : 'wallet.credited',
          payload: { eventId: `${transfer.id}:${wallet.id}:${posting.direction}`, operationId: input.operationId, transferId: transfer.id, walletId: wallet.id, amount: posting.amount.toString(), type: posting.type, referenceId: posting.referenceId ?? null },
        },
      });
    }
    if (input.kind === 'refund') {
      await tx.outboxEvent.create({ data: { eventType: 'wallet.refunded', payload: { eventId: `wallet.refunded:${transfer.id}`, operationId: input.operationId, transferId: transfer.id, amount: debits.toString() } } });
    }
    if (input.kind === 'adjustment') {
      await tx.outboxEvent.create({ data: { eventType: 'wallet.balance.adjusted', payload: { eventId: `wallet.balance.adjusted:${transfer.id}`, operationId: input.operationId, transferId: transfer.id, amount: debits.toString() } } });
    }
    return { ...transfer, idempotentReplay: false };
  }
}
