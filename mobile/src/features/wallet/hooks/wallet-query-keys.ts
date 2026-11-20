import type { WalletTransactionQuery } from '../types/wallet.types';

export const walletQueryKeys = {
  all: ['wallet'] as const,
  me: () => [...walletQueryKeys.all, 'me'] as const,
  paymentByOrder: (orderId: string) => [...walletQueryKeys.all, 'payment-by-order', orderId] as const,
  preferredPaymentMethod: (userId: string | null) => [...walletQueryKeys.all, 'preferred-payment-method', userId] as const,
  transactions: (filters?: WalletTransactionQuery) =>
    [...walletQueryKeys.all, 'transactions', filters ?? {}] as const,
  transactionDetail: (id: string) => [...walletQueryKeys.all, 'transaction', id] as const,
  topupDetail: (id: string) => [...walletQueryKeys.all, 'topup', id] as const,
};
