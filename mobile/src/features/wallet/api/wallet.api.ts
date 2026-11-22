import type {
  BankAccount,
  CreateBankAccountPayload,
  CreateWithdrawalPayload,
  PaginatedWalletTransactions,
  WalletData,
  WalletTransaction,
  WalletTransactionQuery,
  WithdrawalRecord,
} from '../types/wallet.types';
import { ApiClient } from '@/services/api/api-client';

type ApiResponse<T> = { statusCode: number; message: string; data: T };

export const WalletApi = {
  createWithdrawal: (payload: CreateWithdrawalPayload) => ApiClient.post<ApiResponse<WithdrawalRecord>>('/wallets/me/withdrawals', payload),
  getMyWithdrawals: (params?: { page?: number; limit?: number }) => ApiClient.get<ApiResponse<WithdrawalRecord[]>>('/wallets/me/withdrawals', { params }),
  getWithdrawal: (id: string) => ApiClient.get<ApiResponse<WithdrawalRecord>>(`/wallets/me/withdrawals/${encodeURIComponent(id)}`),
  cancelWithdrawal: (id: string) => ApiClient.post<ApiResponse<WithdrawalRecord>>(`/wallets/me/withdrawals/${encodeURIComponent(id)}/cancel`),
  getBankAccounts: () => ApiClient.get<ApiResponse<BankAccount[]>>('/users/me/bank-accounts'),
  addBankAccount: (payload: CreateBankAccountPayload) => ApiClient.post<ApiResponse<BankAccount>>('/users/me/bank-accounts', payload),
  getMyWallet: () => ApiClient.get<ApiResponse<WalletData>>('/wallets/me'),

  getMyTransactions: (params?: WalletTransactionQuery, signal?: AbortSignal) =>
    ApiClient.get<ApiResponse<PaginatedWalletTransactions>>('/wallets/me/transactions', { params, ...(signal ? { signal } : {}) }),

  getTransactionDetail: (transactionId: string) =>
    ApiClient.get<ApiResponse<WalletTransaction>>(
      `/wallets/me/transactions/${encodeURIComponent(transactionId)}`,
    ),
};
