import type { WalletTransactionType } from '../types/wallet.types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { WalletApi } from '../api/wallet.api';
import { walletQueryKeys } from './wallet-query-keys';

const PAGE_SIZE = 15;

export function useWalletTransactions(type?: WalletTransactionType) {
  return useInfiniteQuery({
    queryKey: walletQueryKeys.transactions({ type }),
    queryFn: async ({ pageParam }) =>
      (await WalletApi.getMyTransactions({ page: pageParam, limit: PAGE_SIZE, type })).data,
    initialPageParam: 1,
    getNextPageParam: lastPage =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 60_000,
  });
}
