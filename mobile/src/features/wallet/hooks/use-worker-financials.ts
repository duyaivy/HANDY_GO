import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/use-auth-store';
import { PaymentApi } from '../api/payment.api';
import { WalletApi } from '../api/wallet.api';
import { workerFinancialSummary } from '../utils/worker-financial-summary';
import { walletQueryKeys } from './wallet-query-keys';

const RECENT_TRANSACTIONS_LIMIT = 5;
const PREVIEW_PAGE_LIMIT = 100;

export function useWorkerFinancials() {
  const userId = useAuthStore.use.user()?.id ?? null;
  const query = useQuery({
    queryKey: walletQueryKeys.workerFinancials(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!userId)
        throw new Error('Vui lòng đăng nhập để xem thu nhập.');
      // Bounded single-page fetch to avoid N+1 requests scanning all historical pages on mobile client.
      const [paymentsRes, transactionsRes] = await Promise.all([
        PaymentApi.getMyPayments({ page: 1, limit: PREVIEW_PAGE_LIMIT }, signal),
        WalletApi.getMyTransactions({ page: 1, limit: PREVIEW_PAGE_LIMIT }, signal),
      ]);
      if (signal.aborted)
        throw new Error('Request cancelled');
      const paymentPage = paymentsRes.data;
      const transactionPage = transactionsRes.data;
      const complete = [paymentPage, transactionPage].every(page =>
        page.page === 1
        && page.totalPages === Math.ceil(page.total / page.limit)
        && page.total === page.items.length
        && page.total === new Set(page.items.map(item => item.id)).size,
      );
      return {
        summary: complete ? workerFinancialSummary(paymentPage.items, transactionPage.items, { userId }) : null,
        transactions: transactionPage.items.slice(0, RECENT_TRANSACTIONS_LIMIT),
      };
    },
  });
  return { ...query, isAuthenticated: Boolean(userId) };
}
