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
  balanceBefore?: string | null;
  balanceAfter?: string | null;
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

export type WithdrawalStatus = 'requested' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'needs_review';
export type WithdrawalRecord = {
  id: string;
  userId: string;
  walletId: string;
  bankAccountId: string;
  amount: string;
  status: WithdrawalStatus;
  idempotencyKey: string;
  payoutOperationId: string;
  payoutReference: string | null;
  payoutClaimedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CreateWithdrawalPayload = { bankAccountId: string; amount: string; idempotencyKey: string };
export type BankAccount = {
  id: string;
  userId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};
export type CreateBankAccountPayload = Pick<BankAccount, 'bankCode' | 'bankName' | 'accountNumber' | 'accountHolderName'> & { isDefault?: boolean };
