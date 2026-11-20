import type { WithdrawalRecord } from '../../types/wallet.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { StorageKeys } from '@/constants/storage-keys';
import { ApiError } from '@/services/api/api-error';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { response, withdrawal, workerPayment } from '../../worker/__tests__/fixtures';
import { useCancelWithdrawalMutation, useCreateWithdrawalMutation, useWithdrawalsQuery } from '../use-withdrawal';
import { useWorkerConfirmCash } from '../use-worker-confirm-cash';

let mockUserId = 'worker-1';
const mockStored = new Map<string, unknown>();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1' }));
jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: mockUserId }) } } }));
jest.mock('@/services/storage/storage-service', () => ({ StorageService: {
  getItem: (key: string) => mockStored.get(key) ?? null,
  setItem: (key: string, value: unknown) => mockStored.set(key, value),
  removeItem: (key: string) => mockStored.delete(key),
} }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { createWithdrawal: jest.fn(), cancelWithdrawal: jest.fn(), getMyWithdrawals: jest.fn() } }));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { confirmCash: jest.fn() } }));
function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { ...renderHook(hook, { wrapper }), client };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockStored.clear();
  mockUserId = 'worker-1';
  jest.mocked(WalletApi.createWithdrawal).mockResolvedValue(response(withdrawal));
  jest.mocked(WalletApi.cancelWithdrawal).mockResolvedValue(response({ ...withdrawal, status: 'cancelled' }));
  jest.mocked(WalletApi.getMyWithdrawals).mockResolvedValue(response([]));
  jest.mocked(PaymentApi.confirmCash).mockResolvedValue(response({ ...workerPayment, status: 'succeeded' }));
});
const input = { amount: '100000', bankAccountId: 'bank-1' };
it('persists the same withdrawal key across a failed request and remount', async () => {
  jest.mocked(WalletApi.createWithdrawal).mockRejectedValueOnce(new Error('timeout'));
  const first = setup(useCreateWithdrawalMutation);
  await act(async () => {
    await expect(first.result.current.createWithdrawal(input)).rejects.toThrow('timeout');
  });
  expect(mockStored.get(StorageKeys.PENDING_WITHDRAWAL('worker-1'))).toEqual({ ...input, idempotencyKey: 'key-1' });
  first.unmount();
  const next = setup(useCreateWithdrawalMutation);
  const invalidate = jest.spyOn(next.client, 'invalidateQueries');
  await act(async () => {
    await next.result.current.createWithdrawal(input);
  });
  expect(WalletApi.createWithdrawal).toHaveBeenNthCalledWith(1, { ...input, idempotencyKey: 'key-1' });
  expect(WalletApi.createWithdrawal).toHaveBeenNthCalledWith(2, { ...input, idempotencyKey: 'key-1' });
  expect(mockStored.has(StorageKeys.PENDING_WITHDRAWAL('worker-1'))).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
});
it('blocks a different amount while the previous outcome is unknown, but isolates another account', async () => {
  mockStored.set(StorageKeys.PENDING_WITHDRAWAL('worker-1'), { ...input, idempotencyKey: 'old-key' });
  const { result, rerender } = setup(useCreateWithdrawalMutation);
  await act(async () => {
    await expect(result.current.createWithdrawal({ ...input, amount: '200000' })).rejects.toThrow('Yêu cầu trước');
  });
  expect(WalletApi.createWithdrawal).not.toHaveBeenCalled();
  mockUserId = 'worker-2';
  rerender(undefined);
  await act(async () => {
    await result.current.createWithdrawal({ ...input, amount: '200000',
    });
  });
  expect(WalletApi.createWithdrawal).toHaveBeenCalledWith({ ...input, amount: '200000', idempotencyKey: 'key-1' });
  expect(mockStored.has(StorageKeys.PENDING_WITHDRAWAL('worker-1'))).toBe(true);
});
it('releases a rejected request key after a definitive validation error and validates minimum locally', async () => {
  jest.mocked(WalletApi.createWithdrawal).mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'Insufficient balance', { statusCode: 409 }));
  const { result } = setup(useCreateWithdrawalMutation);
  await act(async () => {
    await expect(result.current.createWithdrawal(input)).rejects.toThrow('Insufficient');
  });
  expect(mockStored.has(StorageKeys.PENDING_WITHDRAWAL('worker-1'))).toBe(false);
  await act(async () => {
    await expect(result.current.createWithdrawal({ ...input, amount: '49999' })).rejects.toThrow('50.000');
  });
  expect(WalletApi.createWithdrawal).toHaveBeenCalledTimes(1);
});
it('coalesces duplicate withdrawal submissions', async () => {
  let finish!: (value: ReturnType<typeof response<WithdrawalRecord>>) => void;
  jest.mocked(WalletApi.createWithdrawal).mockImplementation(() => new Promise((resolve) => {
    finish = resolve;
  }));
  const { result } = setup(useCreateWithdrawalMutation);
  let first!: Promise<WithdrawalRecord>;
  let second!: Promise<WithdrawalRecord>;
  await act(async () => {
    first = result.current.createWithdrawal(input);
    second = result.current.createWithdrawal(input);
    await Promise.resolve();
  });
  expect(WalletApi.createWithdrawal).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(response(withdrawal));
    await Promise.all([first, second]);
  });
});
it('refreshes the wallet even when cancellation conflicts with a provider claim', async () => {
  jest.mocked(WalletApi.cancelWithdrawal).mockRejectedValue(new Error('already processing'));
  const { result, client } = setup(useCancelWithdrawalMutation);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await act(async () => {
    await expect(result.current.cancelWithdrawal('withdrawal-1')).rejects.toThrow('processing');
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
});
it('paginates the actual array withdrawal response', async () => {
  jest.mocked(WalletApi.getMyWithdrawals).mockResolvedValueOnce(response(Array.from({ length: 20 }, (_, index) => ({ ...withdrawal, id: `w-${index}` })))).mockResolvedValueOnce(response([]));
  const { result } = setup(useWithdrawalsQuery);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.hasNextPage).toBe(true);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(WalletApi.getMyWithdrawals).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
  await waitFor(() => expect(result.current.hasNextPage).toBe(false));
});
it('confirms cash once and refreshes payment, wallet and order caches', async () => {
  const { result, client } = setup(useWorkerConfirmCash);
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await act(async () => {
    await Promise.all([result.current.confirmCash('payment-1'), result.current.confirmCash('payment-1')]);
  });
  expect(PaymentApi.confirmCash).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['wallet', 'payment-by-order', 'order-1'])).toMatchObject({ status: 'succeeded' });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] });
});
