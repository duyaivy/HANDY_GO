import type {
  PaginatedWalletTransactions,
  WalletData,
  WalletTransaction,
  WalletTransactionQuery,
} from '../types/wallet.types';
import { ApiClient } from '@/services/api/api-client';

type ApiResponse<T> = { statusCode: number; message: string; data: T };

export const WalletApi = {
  getMyWallet: () => ApiClient.get<ApiResponse<WalletData>>('/wallets/me'),

  getMyTransactions: (params?: WalletTransactionQuery) =>
    ApiClient.get<ApiResponse<PaginatedWalletTransactions>>('/wallets/me/transactions', { params }),

  getTransactionDetail: (transactionId: string) =>
    ApiClient.get<ApiResponse<WalletTransaction>>(
      `/wallets/me/transactions/${encodeURIComponent(transactionId)}`,
    ),
};
