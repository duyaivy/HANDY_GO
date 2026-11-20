import type { OrderPaymentRecord } from '../types/payment.types';
import type { WalletTransaction } from '../types/wallet.types';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/use-auth-store';
import { PaymentApi } from '../api/payment.api';
import { WalletApi } from '../api/wallet.api';
import { workerFinancialSummary } from '../utils/worker-financial-summary';
import { walletQueryKeys } from './wallet-query-keys';

async function allPayments(signal: AbortSignal) {
  const items: OrderPaymentRecord[] = [];
  for (let page = 1; ; page++) {
    if (signal.aborted)
      throw new Error('Request cancelled');
    const data = (await PaymentApi.getMyPayments({ page, limit: 100 }, signal)).data;
    if (data.page !== page || (data.items.length === 0 && page < data.totalPages))
      throw new Error('Dữ liệu thanh toán chưa đầy đủ. Vui lòng thử lại.');
    items.push(...data.items);
    if (page >= data.totalPages)
      return Array.from(new Map(items.map(item => [item.id, item])).values());
  }
}
async function allTransactions(signal: AbortSignal) {
  const items: WalletTransaction[] = [];
  for (let page = 1; ; page++) {
    if (signal.aborted)
      throw new Error('Request cancelled');
    const data = (await WalletApi.getMyTransactions({ page, limit: 100 }, signal)).data;
    if (data.page !== page || (data.items.length === 0 && page < data.totalPages))
      throw new Error('Lịch sử ví chưa đầy đủ. Vui lòng thử lại.');
    items.push(...data.items);
    if (page >= data.totalPages)
      return Array.from(new Map(items.map(item => [item.id, item])).values());
  }
}
export function useWorkerFinancials() {
  const userId = useAuthStore.use.user()?.id ?? null;
  const query = useQuery({
    queryKey: walletQueryKeys.workerFinancials(userId),
    enabled: Boolean(userId),
    staleTime: 30000,
    queryFn: async ({ signal }) => {
      if (!userId)
        throw new Error('Vui lòng đăng nhập để xem thu nhập.');
      const [payments, transactions] = await Promise.all([allPayments(signal), allTransactions(signal)]);
      if (signal.aborted)
        throw new Error('Request cancelled');
      return { ...workerFinancialSummary(payments, transactions, { userId }), payments: payments.filter(item => item.workerUserId === userId), transactions };
    },
  });
  return { ...query, isAuthenticated: Boolean(userId) };
}
