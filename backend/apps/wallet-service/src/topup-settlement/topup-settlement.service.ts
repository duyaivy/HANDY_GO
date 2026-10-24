import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import { PaymentTopupSucceededDto } from './dto/payment-topup-succeeded.dto.js';
@Injectable()
export class TopupSettlementService {
  constructor(private readonly prisma: WalletPrismaService) {}
  async settle(dto: PaymentTopupSucceededDto) {
    const amount = BigInt(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.walletTransaction.findUnique({ where: { idempotencyKey: `topup:${dto.idempotencyKey}` } });
      if (prior) return prior;
      const wallet = await tx.wallet.findUnique({ where: { userId: dto.userId } });
      if (!wallet || wallet.status !== 'active') throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Active wallet not found');
      await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
      const entry = await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'topup', direction: 'credit', amount, operationId: dto.paymentId, idempotencyKey: `topup:${dto.idempotencyKey}`, referenceId: dto.paymentId } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
      const payload = { eventId: `wallet.topup.credited:${entry.id}`, transactionId: entry.id, walletId: wallet.id, userId: dto.userId, paymentId: dto.paymentId, amount: amount.toString() };
      await tx.outboxEvent.createMany({ data: [
        { eventType: 'wallet.credited', payload },
        { eventType: 'wallet.topup.credited', payload },
      ] });
      return entry;
    }, { isolationLevel: 'Serializable' });
  }
}
