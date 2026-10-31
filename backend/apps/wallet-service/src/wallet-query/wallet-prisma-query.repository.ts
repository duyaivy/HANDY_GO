import { Injectable } from '@nestjs/common';
import { WalletPrismaService } from '../wallet-ledger/wallet-prisma.service.js';
import type { WalletQueryRepository } from './wallet-query.service.js';

@Injectable()
export class WalletPrismaQueryRepository implements WalletQueryRepository {
  constructor(private readonly prisma: WalletPrismaService) {}

  async findWalletByUserId(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || !wallet.userId) return null;
    return { ...wallet, userId: wallet.userId, status: wallet.status as string };
  }

  async findTransaction(walletId: string, transactionId: string) {
    const transaction = await this.prisma.walletTransaction.findFirst({ where: { id: transactionId, walletId } });
    return transaction ? { ...transaction, status: transaction.status as string } : null;
  }

  async findTransactions(args: Parameters<WalletQueryRepository['findTransactions']>[0]) {
    const where = {
      walletId: args.walletId,
      ...(args.type ? { type: args.type } : {}),
      ...(args.status ? { status: args.status as never } : {}),
      ...(args.from || args.to ? { createdAt: { ...(args.from ? { gte: args.from } : {}), ...(args.to ? { lte: args.to } : {}) } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({ where, skip: args.skip, take: args.take, orderBy: { createdAt: 'desc' } }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    return { items: items.map((item) => ({ ...item, status: item.status as string })), total };
  }
}
