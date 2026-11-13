import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import { PaymentTopupSucceededDto } from './dto/payment-topup-succeeded.dto.js';
import crypto from 'node:crypto';

/**
 * Top-up có thể đến trước khi ví được provisioning (user.registered xử lý bất đồng bộ).
 * Lỗi này là tạm thời: consumer retry có giới hạn, hết retry thì quarantine và replay được.
 */
export class WalletNotProvisionedException extends AppException {
  constructor() {
    super(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Wallet not provisioned yet');
  }
}

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
    const simulated = dto.provider === 'mock' || dto.isSimulated === true;
    if (simulated && (process.env.NODE_ENV === 'production' || process.env.TOPUP_MOCK_ENABLED?.trim().toLowerCase() !== 'true'))
      throw new AppException(HttpStatus.FORBIDDEN, ERROR_CODES.FORBIDDEN, 'Simulated top-ups are disabled in this Wallet');
    const amount = BigInt(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: dto.userId } });
      if (!wallet) throw new WalletNotProvisionedException();
      if (wallet.status !== 'active') throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Active wallet not found');
      await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${wallet.id}::uuid FOR UPDATE`;
      const prior = await tx.walletTransaction.findFirst({ where: { type: 'topup', referenceId: dto.paymentId } });
      if (prior) {
        if (prior.walletId !== wallet.id || prior.amount !== amount) {
          throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, 'Top-up payload does not match the original payment');
        }
        return prior;
      }
      const entry = await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'topup', direction: 'credit', amount, operationId: dto.paymentId, idempotencyKey: `topup:${dto.idempotencyKey}`, referenceId: dto.paymentId, ...(simulated ? { description: 'MOCK simulated provider confirmation; sandbox Point only' } : {}) } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
      const payload = { eventId: `wallet.topup.credited:${entry.id}`, transactionId: entry.id, walletId: wallet.id, userId: dto.userId, paymentId: dto.paymentId, amount: amount.toString(), provider: dto.provider ?? 'vnpay', isSimulated: simulated };
      await tx.outboxEvent.createMany({ data: [
        { eventType: 'wallet.credited', payload },
        { eventType: 'wallet.topup.credited', payload },
      ] });
      return entry;
    }, { isolationLevel: 'Serializable' });
  }
}
