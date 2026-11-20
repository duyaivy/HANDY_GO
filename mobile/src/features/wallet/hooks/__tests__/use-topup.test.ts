import type { TopupRecord } from '../../types/payment.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import { createElement } from 'react';
import { StorageKeys } from '@/constants/storage-keys';
import { StorageService } from '@/services/storage/storage-service';
import { PaymentApi } from '../../api/payment.api';
import { useTopup } from '../use-topup';
import { walletQueryKeys } from '../wallet-query-keys';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: { use: { user: () => ({ id: 'user-1' }) } },
}));
jest.mock('@/services/storage/storage-service', () => ({
  StorageService: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('../../api/payment.api', () => ({
  PaymentApi: { createTopup: jest.fn(), getTopupDetail: jest.fn(), simulateTopup: jest.fn() },
}));

function topup(status: TopupRecord['status']): TopupRecord {
  return {
    id: 'topup-1',
    amountVnd: '50000',
    pointsToCredit: '50000',
    provider: 'mock',
    isSimulated: true,
    simulationEndpoint: '/payments/topups/topup-1/simulate',
    status,
    checkoutUrl: 'https://example.com/checkout',
    providerPaidAt: null,
    walletCreditedAt: null,
    expiresAt: '2026-01-01',
    createdAt: '2026-01-01',
  };
}
const response = (record: TopupRecord) => ({ statusCode: 200, message: 'ok', data: record });
const savedTopups = new Map<string, { amountVnd: number; idempotencyKey: string }>();

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result, unmount } = renderHook(() => useTopup(), { wrapper });
  return { result, unmount, client };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(randomUUID).mockReturnValue('uuid-1');
  jest.mocked(Linking.openURL).mockResolvedValue(true);
  savedTopups.clear();
  jest.mocked(StorageService.getItem).mockImplementation(key => savedTopups.get(key) ?? null);
  jest.mocked(StorageService.setItem).mockImplementation((key, value) => {
    savedTopups.set(key, value as { amountVnd: number; idempotencyKey: string });
  });
  jest.mocked(StorageService.removeItem).mockImplementation((key) => {
    savedTopups.delete(key);
  });
});
afterEach(() => jest.useRealTimers());

it('returns the checkout URL and reuses the idempotency key after a network failure', async () => {
  jest.mocked(PaymentApi.createTopup)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response(topup('awaiting_payment')));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.createTopup(50_000)).rejects.toThrow('offline');
  });
  let created: TopupRecord | undefined;
  await act(async () => {
    created = await result.current.createTopup(50_000);
  });

  expect(created?.checkoutUrl).toBe('https://example.com/checkout');
  expect(result.current.activeTopup?.id).toBe('topup-1');
  expect(PaymentApi.createTopup).toHaveBeenCalledTimes(2);
  expect(PaymentApi.createTopup).toHaveBeenNthCalledWith(1, { amountVnd: 50_000, idempotencyKey: 'uuid-1' });
  expect(PaymentApi.createTopup).toHaveBeenNthCalledWith(2, { amountVnd: 50_000, idempotencyKey: 'uuid-1' });
  expect(randomUUID).toHaveBeenCalledTimes(1);
  expect(savedTopups.has(StorageKeys.PENDING_TOPUP('user-1'))).toBe(false);
});

it('keeps the same key across a hook remount after an uncertain failure', async () => {
  jest.mocked(PaymentApi.createTopup)
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce(response(topup('awaiting_payment')));
  const first = setup();
  await act(async () => {
    await expect(first.result.current.createTopup(50_000)).rejects.toThrow('timeout');
  });
  expect(savedTopups.get(StorageKeys.PENDING_TOPUP('user-1'))?.idempotencyKey).toBe('uuid-1');
  first.unmount();
  const second = setup();
  await act(async () => {
    await second.result.current.createTopup(50_000);
  });
  expect(PaymentApi.createTopup).toHaveBeenNthCalledWith(2, { amountVnd: 50_000, idempotencyKey: 'uuid-1' });
  expect(randomUUID).toHaveBeenCalledTimes(1);
});

it('sends only one top-up request for rapid duplicate submits', async () => {
  let resolveCreate!: (value: ReturnType<typeof response>) => void;
  jest.mocked(PaymentApi.createTopup).mockImplementation(() =>
    new Promise((resolve) => { resolveCreate = resolve; }));
  const { result } = setup();
  let first!: Promise<TopupRecord>;
  let second!: Promise<TopupRecord>;
  await act(async () => {
    first = result.current.createTopup(50_000);
    second = result.current.createTopup(50_000);
    await Promise.resolve();
  });
  expect(PaymentApi.createTopup).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveCreate(response(topup('awaiting_payment')));
    await Promise.all([first, second]);
  });
});

it('polls a simulated credit_pending top-up until the wallet confirms completion', async () => {
  jest.useFakeTimers();
  jest.mocked(PaymentApi.simulateTopup).mockResolvedValue(response(topup('credit_pending')));
  jest.mocked(PaymentApi.getTopupDetail).mockResolvedValue(response(topup('completed')));
  const { result, client } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');

  await act(async () => {
    await result.current.simulateTopup('topup-1');
  });
  expect(result.current.isPolling).toBe(true);
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2_500);
  });
  expect(result.current.activeTopup?.status).toBe('completed');
  expect(result.current.isPolling).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: walletQueryKeys.all });
  expect(PaymentApi.getTopupDetail).toHaveBeenCalledTimes(1);
});

it('invalidates the wallet immediately when simulation already completed', async () => {
  jest.mocked(PaymentApi.simulateTopup).mockResolvedValue(response(topup('completed')));
  const { result, client } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await act(async () => {
    await result.current.simulateTopup('topup-1');
  });
  expect(result.current.isPolling).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: walletQueryKeys.all });
  expect(PaymentApi.getTopupDetail).not.toHaveBeenCalled();
});

it('opens VNPAY before polling and stops after a terminal failure', async () => {
  jest.useFakeTimers();
  jest.mocked(PaymentApi.getTopupDetail).mockResolvedValue(response(topup('failed')));
  const { result } = setup();
  await act(async () => {
    await result.current.startVnpayCheckout('https://example.com/checkout', 'topup-1');
  });
  expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/checkout');
  expect(PaymentApi.getTopupDetail).not.toHaveBeenCalled();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2_500);
  });
  expect(result.current.isPolling).toBe(false);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(PaymentApi.getTopupDetail).toHaveBeenCalledTimes(1);
});

it('does not poll when the checkout URL cannot be opened', async () => {
  jest.mocked(Linking.openURL).mockRejectedValue(new Error('unsupported URL'));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.startVnpayCheckout('bad-url', 'topup-1'))
      .rejects
      .toThrow('unsupported URL');
  });
  expect(result.current.isPolling).toBe(false);
  expect(PaymentApi.getTopupDetail).not.toHaveBeenCalled();
});

it('never overlaps status requests and clears its timer on unmount', async () => {
  jest.useFakeTimers();
  let resolveStatus!: (value: ReturnType<typeof response>) => void;
  jest.mocked(PaymentApi.getTopupDetail).mockImplementation(() =>
    new Promise((resolve) => { resolveStatus = resolve; }));
  const { result, unmount } = setup();
  await act(async () => {
    await result.current.startVnpayCheckout('https://example.com/checkout', 'topup-1');
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(PaymentApi.getTopupDetail).toHaveBeenCalledTimes(1);
  unmount();
  resolveStatus(response(topup('completed')));
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(PaymentApi.getTopupDetail).toHaveBeenCalledTimes(1);
});

it('stops after forty unsuccessful status checks', async () => {
  jest.useFakeTimers();
  jest.mocked(PaymentApi.getTopupDetail).mockResolvedValue(response(topup('credit_pending')));
  const { result } = setup();
  await act(async () => {
    await result.current.startVnpayCheckout('https://example.com/checkout', 'topup-1');
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_500);
    });
  }
  expect(PaymentApi.getTopupDetail).toHaveBeenCalledTimes(40);
  expect(result.current.isPolling).toBe(false);
  expect(result.current.hasPollingTimedOut).toBe(true);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  expect(PaymentApi.getTopupDetail).toHaveBeenCalledTimes(40);
});
