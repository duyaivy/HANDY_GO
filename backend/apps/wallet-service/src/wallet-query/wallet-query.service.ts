import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { AppException, ERROR_CODES } from '@app/common';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto.js';

export interface WalletRecord {
  id: string;
  userId: string;
  balance: bigint;
  reservedBalance: bigint;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransactionRecord {
  id: string;
  walletId: string;
  type: string;
  amount: bigint;
  status: string;
  referenceId?: string | null;
  description?: string | null;
  createdAt: Date;
}

export interface WalletQueryRepository {
  findWalletByUserId(userId: string): Promise<WalletRecord | null>;
  findTransaction(walletId: string, transactionId: string): Promise<WalletTransactionRecord | null>;
  findTransactions(args: {
    walletId: string;
    skip: number;
    take: number;
    type?: string;
    status?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ items: WalletTransactionRecord[]; total: number }>;
}

export const WALLET_QUERY_REPOSITORY = Symbol('WALLET_QUERY_REPOSITORY');

@Injectable()
export class WalletQueryService {
  constructor(@Inject(WALLET_QUERY_REPOSITORY) private readonly repository: WalletQueryRepository) {}

  async getWallet(userId: string) {
    const wallet = await this.repository.findWalletByUserId(userId);
    if (!wallet) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Wallet not found');
    }
    return this.toWalletResponse(wallet);
  }

  async getTransactions(userId: string, query: WalletTransactionQueryDto) {
    const wallet = await this.repository.findWalletByUserId(userId);
    if (!wallet) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Wallet not found');
    }
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, '`from` must be earlier than `to`');
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const result = await this.repository.findTransactions({
      walletId: wallet.id,
      skip: (page - 1) * limit,
      take: limit,
      type: query.type,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return {
      items: result.items.map((item) => this.toTransactionResponse(item)),
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  async getTransaction(userId: string, transactionId: string) {
    const wallet = await this.repository.findWalletByUserId(userId);
    if (!wallet) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Wallet not found');
    }
    const transaction = await this.repository.findTransaction(wallet.id, transactionId);
    if (!transaction) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Wallet transaction not found');
    }
    return this.toTransactionResponse(transaction);
  }

  async getInternalBalance(userId: string) {
    const wallet = await this.repository.findWalletByUserId(userId);
    if (!wallet) {
      throw new AppException(HttpStatus.NOT_FOUND, ERROR_CODES.NOT_FOUND, 'Wallet not found');
    }
    return this.toWalletResponse(wallet);
  }

  private toWalletResponse(wallet: WalletRecord) {
    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance.toString(),
      reservedBalance: wallet.reservedBalance.toString(),
      availableBalance: (wallet.balance - wallet.reservedBalance).toString(),
      status: wallet.status,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
    };
  }

  private toTransactionResponse(transaction: WalletTransactionRecord) {
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount.toString(),
      status: transaction.status,
      referenceId: transaction.referenceId,
      description: transaction.description,
      createdAt: transaction.createdAt,
    };
  }
}
