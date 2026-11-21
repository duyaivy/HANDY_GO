import type { OrderPaymentRecord } from '../../types/payment.types';
import type { WalletData } from '../../types/wallet.types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement } from 'react';
import { ApiError } from '@/services/api/api-error';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { InsufficientWalletBalanceError, useOrderPayment } from '../use-order-payment';

jest.mock('../../api/payment.api', () => ({
  PaymentApi: { openPayment: jest.fn(), payWithPoints: jest.fn() },
}));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyWallet: jest.fn() } }));

const payment: OrderPaymentRecord = {
  id: 'payment-1',
  orderId: 'order-1',
  customerUserId: 'customer-1',
  workerUserId: 'worker-1',
  amount: '50000',
  currency: 'VND',
  method: 'point',
  status: 'pending',
  platformFee: '5000',
  workerEarning: '45000',
  refundedAmount: '0',
  orderCompletedAt: '2026-01-01',
  paidAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const wallet: WalletData = {
  id: 'wallet-1',
  userId: 'customer-1',
  balance: '60000',
  reservedBalance: '0',
  availableBalance: '60000',
  status: 'active',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const response = <T>(data: T) => ({ statusCode: 200, message: 'ok', data });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { ...renderHook(() => useOrderPayment('order-1'), { wrapper }), client };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(PaymentApi.openPayment).mockResolvedValue(response(payment));
  jest.mocked(PaymentApi.payWithPoints).mockResolvedValue(response({ ...payment, status: 'succeeded' }));
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response(wallet));
});

it('opens a point payment, verifies available balance, then settles it', async () => {
  const { result, client } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let settled: OrderPaymentRecord | undefined;
  await act(async () => {
    settled = await result.current.processPayment('point');
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(settled?.status).toBe('succeeded');
  expect(PaymentApi.openPayment).toHaveBeenCalledWith({ orderId: 'order-1', method: 'point' });
  expect(WalletApi.getMyWallet).toHaveBeenCalledTimes(1);
  expect(PaymentApi.payWithPoints).toHaveBeenCalledWith('payment-1');
  expect(jest.mocked(PaymentApi.openPayment).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(WalletApi.getMyWallet).mock.invocationCallOrder[0]);
  expect(jest.mocked(WalletApi.getMyWallet).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(PaymentApi.payWithPoints).mock.invocationCallOrder[0]);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] });
});

it('opens cash without charging points', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.processPayment('cash');
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(PaymentApi.openPayment).toHaveBeenCalledWith({ orderId: 'order-1', method: 'cash' });
  expect(WalletApi.getMyWallet).not.toHaveBeenCalled();
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});

it('rejects insufficient balance before sending a point charge', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, availableBalance: '10000' }));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.processPayment('point'))
      .rejects
      .toMatchObject({ name: 'InsufficientWalletBalanceError', shortfall: '40000' });
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  await waitFor(() => expect(result.current.paymentError).toBeInstanceOf(InsufficientWalletBalanceError));
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});

it('coalesces rapid duplicate submits into one payment request', async () => {
  let resolveOpen!: (value: ReturnType<typeof response<OrderPaymentRecord>>) => void;
  jest.mocked(PaymentApi.openPayment).mockImplementation(() =>
    new Promise((resolve) => { resolveOpen = resolve; }));
  const { result } = setup();
  let first!: Promise<OrderPaymentRecord>;
  let second!: Promise<OrderPaymentRecord>;
  await act(async () => {
    first = result.current.processPayment('cash');
    second = result.current.processPayment('cash');
    await Promise.resolve();
  });
  expect(PaymentApi.openPayment).toHaveBeenCalledTimes(1);
  resolveOpen(response(payment));
  await act(async () => {
    await Promise.all([first, second]);
  });
});

it('rejects a changed snapshot amount before charging', async () => {
  const { result } = setup();
  await act(async () => {
    await expect(result.current.processPayment('point', '40000')).rejects.toThrow('Chi phí đơn hàng đã thay đổi');
  });
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});

it('sends the displayed amount for atomic server validation and refreshes stale order data', async () => {
  jest.mocked(PaymentApi.openPayment).mockRejectedValue(new ApiError('VALIDATION_ERROR', 'Payment amount changed', { statusCode: 409 }));
  const { result, client } = setup();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await act(async () => {
    await expect(result.current.processPayment('cash', '40000')).rejects.toThrow('Chi phí đơn hàng đã thay đổi');
  });
  expect(PaymentApi.openPayment).toHaveBeenCalledWith({ orderId: 'order-1', method: 'cash', expectedAmount: '40000' });
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['orders'] });
});

it('returns an already settled payment even when the remaining wallet balance is low', async () => {
  jest.mocked(PaymentApi.openPayment).mockResolvedValue(response({ ...payment, status: 'succeeded' }));
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, availableBalance: '0' }));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.processPayment('point')).resolves.toMatchObject({ status: 'succeeded' });
  });
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
  expect(WalletApi.getMyWallet).not.toHaveBeenCalled();
});

it('rejects a frozen wallet before sending a charge', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, status: 'frozen' }));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.processPayment('point')).rejects.toThrow('Ví hiện không hoạt động');
  });
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});

it('explains an uninitialized payment without reading or charging the wallet, then permits a safe retry', async () => {
  jest.mocked(PaymentApi.openPayment).mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'Payment is not ready for this order yet', { statusCode: 409, code: 'CONFLICT' }));
  const { result } = setup();
  await act(async () => {
    await expect(result.current.processPayment('point')).rejects.toThrow('Lần thử này chưa trừ tiền ví');
  });
  expect(WalletApi.getMyWallet).not.toHaveBeenCalled();
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
  await act(async () => {
    await expect(result.current.processPayment('point')).resolves.toMatchObject({ status: 'succeeded' });
  });
  expect(PaymentApi.payWithPoints).toHaveBeenCalledTimes(1);
});

it('preserves other payment conflict errors instead of describing them as delayed initialization', async () => {
  const conflict = new ApiError('VALIDATION_ERROR', 'Order data does not match the payment snapshot', { statusCode: 409 });
  jest.mocked(PaymentApi.openPayment).mockRejectedValueOnce(conflict);
  const { result } = setup();
  await act(async () => {
    await expect(result.current.processPayment('point')).rejects.toBe(conflict);
  });
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});
