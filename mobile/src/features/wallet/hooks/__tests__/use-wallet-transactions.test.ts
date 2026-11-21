import type { PaginatedWalletTransactions } from '../../types/wallet.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { WalletApi } from '../../api/wallet.api';
import { useWalletTransactions } from '../use-wallet-transactions';

jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyTransactions: jest.fn() } }));

function page(number: number): PaginatedWalletTransactions {
  return {
    items: [],
    page: number,
    limit: 15,
    total: 16,
    totalPages: 2,
  };
}

it('loads pages in order and includes the type filter in each request', async () => {
  jest.mocked(WalletApi.getMyTransactions)
    .mockResolvedValueOnce({ statusCode: 200, message: 'ok', data: page(1) })
    .mockResolvedValueOnce({ statusCode: 200, message: 'ok', data: page(2) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useWalletTransactions('topup'), { wrapper });

  await waitFor(() => expect(result.current.hasNextPage).toBe(true));
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  expect(result.current.data?.pages.map(item => item.page)).toEqual([1, 2]);
  expect(result.current.hasNextPage).toBe(false);
  expect(WalletApi.getMyTransactions).toHaveBeenNthCalledWith(1, { page: 1, limit: 15, type: 'topup' });
  expect(WalletApi.getMyTransactions).toHaveBeenNthCalledWith(2, { page: 2, limit: 15, type: 'topup' });
});
