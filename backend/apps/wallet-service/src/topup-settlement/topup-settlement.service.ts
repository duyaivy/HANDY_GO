import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import { PaymentTopupSucceededDto } from './dto/payment-topup-succeeded.dto.js';
import crypto from 'node:crypto';
@Injectable()
export class TopupSettlementService {
  constructor(private readonly prisma: WalletPrismaService) {}
  async quarantine(event: unknown, reason: string, error?: unknown) {
    const payload = event && typeof event === 'object' ? event : { value: event };
    const eventId = event && typeof event === 'object' && typeof (event as { eventId?: unknown }).eventId === 'string'
      ? (event as { eventId: string }).eventId
      : `invalid-topup-${crypto.randomUUID()}`;
    return this.prisma.deadLetterEvent.upsert({
      where: { eventId },
      create: { eventId, eventType: 'payment.topup.succeeded', payload, reason, error: error instanceof Error ? error.message : undefined },
      update: { reason, error: error instanceof Error ? error.message : undefined },
    });
  }
  async settle(dto: PaymentTopupSucceededDto) {
    const amount = BigInt(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: dto.userId } });
      if (!wallet || wallet.status !== 'active') throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Active wallet not found');
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${wallet.id}::uuid FOR UPDATE`;
      const prior = await tx.walletTransaction.findFirst({ where: { type: 'topup', referenceId: dto.paymentId } });
      if (prior) {
        if (prior.walletId !== wallet.id || prior.amount !== amount) {
          throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Top-up payload does not match the original payment');
        }
        return prior;
      }
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
