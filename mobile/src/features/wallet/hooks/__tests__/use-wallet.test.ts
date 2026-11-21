import type { WalletData } from '../../types/wallet.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { ApiError } from '@/services/api/api-error';
import { WalletApi } from '../../api/wallet.api';
import { useWallet } from '../use-wallet';

jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyWallet: jest.fn() } }));

const wallet: WalletData = {
  id: 'wallet-1',
  userId: 'user-1',
  balance: '50000',
  reservedBalance: '5000',
  availableBalance: '45000',
  status: 'active',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } }),
  }, children);
}

beforeEach(() => jest.clearAllMocks());

it('returns the wallet balances from the API', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue({ statusCode: 200, message: 'ok', data: wallet });
  const { result } = renderHook(() => useWallet(), { wrapper });
  await waitFor(() => expect(result.current.wallet).toEqual(wallet));
  expect(result.current.balance).toBe('50000');
  expect(result.current.availableBalance).toBe('45000');
  expect(result.current.reservedBalance).toBe('5000');
  expect(result.current.isWalletNotFound).toBe(false);
});

it('treats a missing wallet as an empty state without retrying', async () => {
  jest.mocked(WalletApi.getMyWallet).mockRejectedValue(new ApiError('NOT_FOUND', 'Missing', { statusCode: 404 }));
  const { result } = renderHook(() => useWallet(), { wrapper });
  await waitFor(() => expect(result.current.isWalletNotFound).toBe(true));
  expect(result.current.isError).toBe(false);
  expect(result.current.balance).toBe('0');
  expect(result.current.status).toBeNull();
  expect(WalletApi.getMyWallet).toHaveBeenCalledTimes(1);
});
