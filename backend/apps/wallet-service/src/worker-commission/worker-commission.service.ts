import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletLedgerService } from '../wallet-ledger/wallet-ledger.service.js';
import { CollectCommissionDto } from './dto/collect-commission.dto.js';
@Injectable()
export class WorkerCommissionService {
  constructor(private readonly ledger: WalletLedgerService) {}
  async collect(dto: CollectCommissionDto) {
    const [worker, platform] = await Promise.all([this.ledger.prisma.wallet.findUnique({ where: { userId: dto.workerUserId } }), this.ledger.prisma.wallet.findUnique({ where: { systemKey: 'PLATFORM_FEES' } })]);
    if (!worker || !platform) throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Commission wallet not found');
    try { return await this.ledger.createBalancedTransfer({ operationId: `commission:${dto.paymentId}`, idempotencyKey: `commission:${dto.idempotencyKey}`, kind: 'commission_collection', postings: [
      { walletId: worker.id, direction: 'debit', amount: BigInt(dto.amount), type: 'commission_debit', referenceId: dto.paymentId },
      { walletId: platform.id, direction: 'credit', amount: BigInt(dto.amount), type: 'commission_credit', referenceId: dto.paymentId },
    ] }); }
    catch (error) { throw new AppException(HttpStatus.CONFLICT, ERROR_CODES.VALIDATION_ERROR, `Commission collection pending: ${(error as Error).message}`); }
  }
}
