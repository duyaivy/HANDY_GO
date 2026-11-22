import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/use-auth-store';
import { PaymentApi } from '../api/payment.api';
import { walletQueryKeys } from './wallet-query-keys';

export const CASH_PAYMENTS_PAGE_SIZE = 15;

export function useWorkerCashPayments() {
  const userId = useAuthStore.use.user()?.id ?? null;
  const query = useInfiniteQuery({
    queryKey: walletQueryKeys.workerCashPayments(userId),
    enabled: Boolean(userId),
    queryFn: async ({ pageParam = 1, signal }) => {
      const res = await PaymentApi.getMyPayments(
        { page: pageParam, limit: CASH_PAYMENTS_PAGE_SIZE },
        signal,
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: lastPage =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  });

  return { ...query, userId, isAuthenticated: Boolean(userId) };
}
