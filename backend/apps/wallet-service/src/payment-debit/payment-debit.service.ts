import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletLedgerService } from '../wallet-ledger/wallet-ledger.service.js';
import { DebitPaymentDto } from './dto/debit-payment.dto.js';

@Injectable()
export class PaymentDebitService {
  constructor(private readonly ledger: WalletLedgerService) {}

  async debit(customerUserId: string, dto: DebitPaymentDto) {
    if (!customerUserId || customerUserId === dto.workerUserId) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Customer and worker must be distinct users');
    }
    const gross = BigInt(dto.grossAmount);
    const earning = BigInt(dto.workerEarning);
    const fee = BigInt(dto.platformFee);
    if (earning + fee !== gross || earning <= 0n || fee < 0n) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Gross amount must equal worker earning plus platform fee');
    }
    const operationId = `${dto.paymentId}:${dto.attemptId}`;
    const [customer, worker, platform] = await Promise.all([
      this.ledger.prisma.wallet.findUnique({ where: { userId: customerUserId } }),
      this.ledger.prisma.wallet.findUnique({ where: { userId: dto.workerUserId } }),
      this.ledger.prisma.wallet.findUnique({ where: { systemKey: 'PLATFORM_FEES' } }),
    ]);
    if (!customer || !worker || !platform) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'One or more wallets are missing');
    const result = await this.ledger.createBalancedTransfer({
      operationId, idempotencyKey: operationId, kind: 'payment',
      postings: [
        { walletId: customer.id, direction: 'debit', amount: gross, type: 'payment_debit', referenceId: dto.paymentId },
        { walletId: worker.id, direction: 'credit', amount: earning, type: 'worker_earning', referenceId: dto.paymentId },
        ...(fee > 0n ? [{ walletId: platform.id, direction: 'credit' as const, amount: fee, type: 'platform_fee', referenceId: dto.paymentId }] : []),
      ],
    });
    return { operationId, status: result.status, idempotentReplay: result.idempotentReplay };
  }

  async getStatus(operationId: string) {
    const transfer = await this.ledger.prisma.walletTransfer.findUnique({ where: { operationId } });
    if (!transfer) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Payment operation not found');
    return { operationId, status: transfer.status };
  }
}
