export type WalletStatus = 'active' | 'frozen' | 'closed';

export type WalletData = {
  id: string;
  userId: string;
  balance: string;
  reservedBalance: string;
  availableBalance: string;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
};

// The ledger stores type as a string. These are the values currently emitted by
// wallet-service; the query endpoint does not return a separate direction field.
export type WalletTransactionType
  = | 'topup'
    | 'payment_debit'
    | 'worker_earning'
    | 'platform_fee'
    | 'refund_credit'
    | 'refund_recovery'
    | 'withdrawal'
    | 'commission_debit'
    | 'commission_credit'
    | 'adjustment_funding'
    | 'adjustment_recovery'
    | 'admin_adjustment';

export type WalletTransactionStatus = 'pending' | 'completed' | 'reversed' | 'failed';

export type WalletTransaction = {
  id: string;
  type: WalletTransactionType;
  amount: string;
  status: WalletTransactionStatus;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
};

export type WalletTransactionQuery = {
  page?: number;
  limit?: number;
  type?: WalletTransactionType;
  status?: WalletTransactionStatus;
  from?: string;
  to?: string;
};

export type PaginatedWalletTransactions = {
  items: WalletTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
