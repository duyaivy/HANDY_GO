import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
import { BankAccountVerifier } from './bank-account-verifier/bank-account-verifier.port.js';

export type PayoutTerminalStatus = 'succeeded' | 'failed' | 'cancelled';

/**
 * Contract giữa Wallet và Payment (Payment điều phối payout, Wallet giữ withdrawal/hold/ledger):
 *  1. Wallet tạo withdrawal `requested` + hold và phát `wallet.withdrawal.requested` kèm `payoutOperationId`.
 *  2. Payment gọi claim(id, payoutOperationId) TRƯỚC khi gửi tiền cho provider: requested → processing.
 *     Từ lúc này user không thể huỷ; hold được giữ cho tới khi có kết quả cuối.
 *  3. Payment gọi finish(id, { payoutOperationId, status }) với succeeded | failed | cancelled.
 *  4. claim/finish lặp lại cùng payoutOperationId là idempotent; payoutOperationId sai → 409.
 *  5. Kết quả cuối mâu thuẫn với kết quả đã ghi (vd failed → succeeded) → needs_review, không tự đổi tiền.
 */
@Injectable()
export class WithdrawalService {
  constructor(private readonly prisma: WalletPrismaService, private readonly bankAccountVerifier: BankAccountVerifier) {}

  async create(userId: string, dto: CreateWithdrawalDto) {
    const amount = BigInt(dto.amount);

    // Replay của yêu cầu đã commit không được phụ thuộc User Trust đang sống hay không.
    const existing = await this.prisma.withdrawal.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return this.assertSameRequest(existing, userId, amount, dto.bankAccountId);

    // verify() ném 503 khi User Trust tạm lỗi; false chỉ khi bị từ chối rõ ràng.
    if (!(await this.bankAccountVerifier.verify(userId, dto.bankAccountId))) {
      throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Bank account ownership could not be verified');
    }

    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.withdrawal.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (prior) return this.assertSameRequest(prior, userId, amount, dto.bankAccountId);
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.status !== 'active') throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Active wallet not found');
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${wallet.id}::uuid FOR UPDATE`;
      const locked = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      if (locked.balance - locked.reservedBalance < amount) throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Insufficient available balance');
      const withdrawal = await tx.withdrawal.create({ data: { userId, walletId: wallet.id, bankAccountId: dto.bankAccountId, amount, idempotencyKey: dto.idempotencyKey } });
      await tx.walletHold.create({ data: { walletId: wallet.id, withdrawalId: withdrawal.id, amount } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: { increment: amount } } });
      await tx.outboxEvent.create({
        data: {
          eventType: 'wallet.withdrawal.requested',
          payload: {
            eventId: `wallet.withdrawal.requested:${withdrawal.id}`,
            withdrawalId: withdrawal.id,
            payoutOperationId: withdrawal.payoutOperationId,
            userId,
            bankAccountId: dto.bankAccountId,
            amount: amount.toString(),
          },
        },
      });
      return withdrawal;
    }, { isolationLevel: 'Serializable' });
  }

  private assertSameRequest<T extends { userId: string; amount: bigint; bankAccountId: string }>(prior: T, userId: string, amount: bigint, bankAccountId: string): T {
    if (prior.userId !== userId || prior.amount !== amount || prior.bankAccountId !== bankAccountId) {
      throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Withdrawal idempotency payload does not match the original request');
    }
    return prior;
  }

  list(userId: string, skip = 0, take = 20) { return this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take }); }
  async getById(id: string) { const item = await this.prisma.withdrawal.findUnique({ where: { id } }); if (!item) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found'); return item; }
  async get(userId: string, id: string) { const item = await this.prisma.withdrawal.findFirst({ where: { id, userId } }); if (!item) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found'); return item; }

  async cancel(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findFirst({ where: { id, userId } });
      if (!withdrawal) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found');
      if (withdrawal.status === 'cancelled') return withdrawal;
      if (withdrawal.status !== 'requested') {
        throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Withdrawal is already being processed and cannot be cancelled safely');
      }
      const hold = await tx.walletHold.findUnique({ where: { withdrawalId: id } });
      if (!hold || hold.status !== 'active') {
        return tx.withdrawal.update({ where: { id }, data: { status: 'cancelled' } });
      }
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${withdrawal.walletId}::uuid FOR UPDATE`;
      await tx.walletHold.update({ where: { id: hold.id }, data: { status: 'released' } });
      await tx.wallet.update({ where: { id: withdrawal.walletId }, data: { reservedBalance: { decrement: hold.amount } } });
      const updated = await tx.withdrawal.update({ where: { id }, data: { status: 'cancelled' } });
      await tx.outboxEvent.create({ data: { eventType: 'wallet.withdrawal.cancelled', payload: { eventId: `wallet.withdrawal.cancelled:${id}`, withdrawalId: id, status: 'cancelled' } } });
      return updated;
    }, { isolationLevel: 'Serializable' });
  }

  /** Payment claim withdrawal trước khi gửi payout. Idempotent theo payoutOperationId. */
  async claim(id: string, input: { payoutOperationId: string; payoutReference?: string }) {
    try {
      return await this.claimTx(id, input);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'payoutReference already used by another withdrawal');
      }
      throw e;
    }
  }

  private claimTx(id: string, input: { payoutOperationId: string; payoutReference?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({ where: { id } });
      if (!withdrawal) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found');
      this.assertPayoutOperation(withdrawal.payoutOperationId, input.payoutOperationId);
      if (withdrawal.status === 'processing') return withdrawal;
      if (withdrawal.status !== 'requested') {
        throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, `Cannot claim payout: withdrawal is ${withdrawal.status}`);
      }
      return tx.withdrawal.update({
        where: { id },
        data: { status: 'processing', payoutClaimedAt: new Date(), ...(input.payoutReference ? { payoutReference: input.payoutReference } : {}) },
      });
    }, { isolationLevel: 'Serializable' });
  }

  /** Callback kết quả payout từ Payment. */
  async finish(id: string, input: { payoutOperationId: string; status: PayoutTerminalStatus }) {
    const { status } = input;
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({ where: { id } });
      if (!withdrawal) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found');
      this.assertPayoutOperation(withdrawal.payoutOperationId, input.payoutOperationId);

      if (withdrawal.status === 'needs_review' || withdrawal.status === status) return withdrawal;
      if (withdrawal.status === 'requested') {
        throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Withdrawal must be claimed (processing) before a payout result is accepted');
      }

      if (withdrawal.status !== 'processing') {
        // failed và cancelled đều nghĩa là không có tiền ra ngoài và hold đã nhả: callback còn lại là vô hại.
        const noMoneyMoved = (s: string) => s === 'failed' || s === 'cancelled';
        if (noMoneyMoved(withdrawal.status) && noMoneyMoved(status)) return withdrawal;
        return this.markNeedsReview(tx, withdrawal, status, 'Conflicting payout result after a terminal state was recorded');
      }

      const hold = await tx.walletHold.findUnique({ where: { withdrawalId: id } });
      if (!hold || hold.status !== 'active') {
        return this.markNeedsReview(tx, withdrawal, status, 'Hold is not active for a processing withdrawal');
      }

      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${withdrawal.walletId}::uuid FOR UPDATE`;
      await tx.walletHold.update({ where: { id: hold.id }, data: { status: status === 'succeeded' ? 'captured' : 'released' } });
      await tx.wallet.update({
        where: { id: withdrawal.walletId },
        data: { reservedBalance: { decrement: hold.amount }, ...(status === 'succeeded' ? { balance: { decrement: hold.amount } } : {}) },
      });
      if (status === 'succeeded') {
        await tx.walletTransaction.create({ data: { walletId: withdrawal.walletId, type: 'withdrawal', direction: 'debit', amount: hold.amount, operationId: id, idempotencyKey: `withdrawal:${id}`, referenceId: id } });
        await tx.outboxEvent.create({ data: { eventType: 'wallet.debited', payload: { eventId: `wallet.debited:withdrawal:${id}`, withdrawalId: id, walletId: withdrawal.walletId, amount: hold.amount.toString(), type: 'withdrawal' } } });
      }
      const updated = await tx.withdrawal.update({ where: { id }, data: { status } });
      await tx.outboxEvent.create({
        data: {
          eventType: status === 'succeeded' ? 'wallet.withdrawal.succeeded' : status === 'cancelled' ? 'wallet.withdrawal.cancelled' : 'wallet.withdrawal.failed',
          payload: { eventId: `wallet.withdrawal.${status}:${id}`, withdrawalId: id, status },
        },
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
  }

  private assertPayoutOperation(expected: string, supplied: string): void {
    if (expected !== supplied) {
      throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'payoutOperationId does not match this withdrawal');
    }
  }

  private async markNeedsReview(
    tx: Pick<WalletPrismaService, 'withdrawal' | 'outboxEvent'>,
    withdrawal: { id: string; status: string },
    conflictingStatus: string,
    reason: string,
  ) {
    const updated = await tx.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'needs_review', reviewReason: reason.slice(0, 200) } });
    await tx.outboxEvent.create({
      data: {
        eventType: 'wallet.withdrawal.needs_review',
        payload: { eventId: `wallet.withdrawal.needs_review:${withdrawal.id}`, withdrawalId: withdrawal.id, conflictingStatus, previousStatus: withdrawal.status, reason },
      },
    });
    return updated;
  }
}
