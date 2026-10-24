import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto.js';
@Injectable()
export class WithdrawalService {
  constructor(private readonly prisma: WalletPrismaService) {}
  async create(userId: string, dto: CreateWithdrawalDto) {
    const amount = BigInt(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.withdrawal.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (prior) return prior;
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.status !== 'active') throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Active wallet not found');
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
      const locked = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
      if (locked.balance - locked.reservedBalance < amount) throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Insufficient available balance');
      const withdrawal = await tx.withdrawal.create({ data: { userId, walletId: wallet.id, bankAccountId: dto.bankAccountId, amount, idempotencyKey: dto.idempotencyKey } });
      await tx.walletHold.create({ data: { walletId: wallet.id, withdrawalId: withdrawal.id, amount } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { reservedBalance: { increment: amount } } });
      await tx.outboxEvent.create({ data: { eventType: 'wallet.withdrawal.requested', payload: { eventId: `wallet.withdrawal.requested:${withdrawal.id}`, withdrawalId: withdrawal.id, userId, bankAccountId: dto.bankAccountId, amount: amount.toString() } } });
      return withdrawal;
    }, { isolationLevel: 'Serializable' });
  }
  list(userId: string, skip = 0, take = 20) { return this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip, take }); }
  async getById(id: string) { const item = await this.prisma.withdrawal.findUnique({ where: { id } }); if (!item) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found'); return item; }
  async get(userId: string, id: string) { const item = await this.prisma.withdrawal.findFirst({ where: { id, userId } }); if (!item) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found'); return item; }
  async cancel(userId: string, id: string) { return this.finish(userId, id, 'cancelled'); }
  async finish(userId: string, id: string, status: 'succeeded'|'failed'|'cancelled') {
    return this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findFirst({ where: { id, userId } });
      if (!withdrawal) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Withdrawal not found');
      const hold = await tx.walletHold.findUnique({ where: { withdrawalId: id } });
      if (!hold || hold.status !== 'active') return withdrawal;
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${withdrawal.walletId}::uuid FOR UPDATE`;
      await tx.walletHold.update({ where: { id: hold.id }, data: { status: status === 'succeeded' ? 'captured' : 'released' } });
      await tx.wallet.update({ where: { id: withdrawal.walletId }, data: { reservedBalance: { decrement: hold.amount }, ...(status === 'succeeded' ? { balance: { decrement: hold.amount } } : {}) } });
      if (status === 'succeeded') {
        await tx.walletTransaction.create({ data: { walletId: withdrawal.walletId, type: 'withdrawal', direction: 'debit', amount: hold.amount, operationId: id, idempotencyKey: `withdrawal:${id}`, referenceId: id } });
        await tx.outboxEvent.create({ data: { eventType: 'wallet.debited', payload: { eventId: `wallet.debited:withdrawal:${id}`, withdrawalId: id, walletId: withdrawal.walletId, amount: hold.amount.toString(), type: 'withdrawal' } } });
      }
      const updated = await tx.withdrawal.update({ where: { id }, data: { status } });
      await tx.outboxEvent.create({ data: { eventType: status === 'succeeded' ? 'wallet.withdrawal.succeeded' : status === 'cancelled' ? 'wallet.withdrawal.cancelled' : 'wallet.withdrawal.failed', payload: { eventId: `wallet.withdrawal.${status}:${id}`, withdrawalId: id, status } } });
      return updated;
    }, { isolationLevel: 'Serializable' });
  }
}
