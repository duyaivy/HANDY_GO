import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/services/api/api-error';
import { WalletApi } from '../api/wallet.api';
import { walletQueryKeys } from './wallet-query-keys';

export function useWallet() {
  const query = useQuery({
    queryKey: walletQueryKeys.me(),
    queryFn: async () => (await WalletApi.getMyWallet()).data,
    staleTime: 30_000,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.statusCode === 404) && failureCount < 2,
  });
  const wallet = query.data;
  const isWalletNotFound = query.error instanceof ApiError && query.error.statusCode === 404;

  return {
    wallet,
    balance: wallet?.balance ?? '0',
    availableBalance: wallet?.availableBalance ?? '0',
    reservedBalance: wallet?.reservedBalance ?? '0',
    currency: 'POINT' as const,
    status: wallet?.status ?? null,
    isLoading: query.isLoading,
    isError: query.isError && !isWalletNotFound,
    isWalletNotFound,
    error: query.error,
    refetch: query.refetch,
  };
}
