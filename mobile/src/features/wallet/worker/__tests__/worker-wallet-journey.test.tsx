import type { WalletTransaction, WithdrawalRecord } from '../../types/wallet.types';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { WorkerJobDetailScreen } from '@/features/orders/worker/screens/worker-job-detail-screen';
import { CustomerTransactionHistoryScreen } from '@/features/profile/customer/screens/customer-transaction-history-screen';
import { act, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { WorkerCashPaymentsScreen } from '../screens/worker-cash-payments-screen';
import { WorkerDepositScreen } from '../screens/worker-deposit-screen';
import { WorkerWalletScreen } from '../screens/worker-wallet-screen';
import { WorkerWithdrawScreen } from '../screens/worker-withdraw-screen';
import { bankAccount, response, withdrawal, workerPayment, workerWallet } from './fixtures';

let mockNavigate: (path: string) => void;
const mockStored = new Map<string, unknown>();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (path: string) => mockNavigate(path), back: () => mockNavigate('/worker/wallet') }), useLocalSearchParams: () => ({ id: 'order-1' }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'withdrawal-key' }));
jest.mock('@shopify/flash-list', () => ({ FlashList: require('react-native').FlatList }));
jest.mock('@shopify/flash-list/jestSetup', () => ({}));
jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: 'worker-1' }) } } }));
jest.mock('@/services/storage/storage-service', () => ({ StorageService: { getItem: (key: string) => mockStored.get(key) ?? null, setItem: (key: string, value: unknown) => mockStored.set(key, value), removeItem: (key: string) => mockStored.delete(key) } }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyWallet: jest.fn(), getMyTransactions: jest.fn(), getMyWithdrawals: jest.fn(), getBankAccounts: jest.fn(), createWithdrawal: jest.fn(), cancelWithdrawal: jest.fn() } }));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { getMyPayments: jest.fn(), createTopup: jest.fn(), simulateTopup: jest.fn(), getPaymentByOrder: jest.fn(), confirmCash: jest.fn() } }));
jest.mock('@/features/orders/api/orders.api', () => ({ OrdersApi: { getOrderDetail: jest.fn(), getStatusHistory: jest.fn() } }));
jest.mock('@/features/tracking', () => ({ ...jest.requireActual('@/features/tracking'), useTrackingSummary: () => ({ data: undefined, isError: true, isLoading: false }), useTrackingEvents: () => ({ connectionStatus: 'disconnected' }) }));
function Journey() {
  const [path, setPath] = useState('/worker/wallet');
  useEffect(() => {
    mockNavigate = setPath;
  }, []);
  if (path.endsWith('/deposit'))
    return <WorkerDepositScreen />;
  if (path.endsWith('/withdraw'))
    return <WorkerWithdrawScreen />;
  if (path.endsWith('/history'))
    return <CustomerTransactionHistoryScreen worker />;
  if (path.endsWith('/cash-payments'))
    return <WorkerCashPaymentsScreen />;
  if (path.includes('/jobs/'))
    return <WorkerJobDetailScreen jobId="order-1" />;
  return <WorkerWalletScreen />;
}
it('deposits, views transactions, reserves/cancels a withdrawal and confirms cash without crediting cash to the wallet', async () => {
  mockStored.clear();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let balance = 100000n;
  let reserved = 0n;
  const rows: WithdrawalRecord[] = [];
  let payment = { ...workerPayment };
  const ledger: WalletTransaction[] = [{ id: 'tx-initial', type: 'topup', amount: '100000', status: 'completed', referenceId: null, description: null, createdAt: '2026-11-20T10:00:00Z' }];
  jest.mocked(WalletApi.getMyWallet).mockImplementation(async () => response({ ...workerWallet, balance: String(balance), availableBalance: String(balance - reserved), reservedBalance: String(reserved) }));
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(async params => response({ items: ledger.filter(item => !params?.type || item.type === params.type), page: 1, limit: params?.limit ?? 100, total: ledger.length, totalPages: 1 }));
  jest.mocked(PaymentApi.getMyPayments).mockImplementation(async () => response({ items: [payment], page: 1, limit: 100, total: 1, totalPages: 1 }));
  jest.mocked(WalletApi.getBankAccounts).mockResolvedValue(response([bankAccount]));
  jest.mocked(WalletApi.getMyWithdrawals).mockImplementation(async () => response(rows.map(item => ({ ...item }))));
  const topup = { id: 'topup-1', amountVnd: '200000', pointsToCredit: '200000', provider: 'mock' as const, isSimulated: true, simulationEndpoint: null, status: 'awaiting_payment' as const, checkoutUrl: null, providerPaidAt: null, walletCreditedAt: null, expiresAt: '', createdAt: '' };
  jest.mocked(PaymentApi.createTopup).mockResolvedValue(response(topup));
  jest.mocked(PaymentApi.simulateTopup).mockImplementation(async () => {
    balance += 200000n;
    ledger.unshift({ ...ledger[0]!, id: 'tx-topup', amount: '200000' });
    return response({ ...topup, status: 'completed' });
  });
  jest.mocked(WalletApi.createWithdrawal).mockImplementation(async (payload) => {
    reserved += BigInt(payload.amount);
    const item = { ...withdrawal, ...payload };
    rows.unshift(item);
    return response(item);
  });
  jest.mocked(WalletApi.cancelWithdrawal).mockImplementation(async () => {
    reserved -= BigInt(rows[0]!.amount);
    rows[0]!.status = 'cancelled';
    return response({ ...rows[0]! });
  });
  jest.mocked(PaymentApi.getPaymentByOrder).mockImplementation(async () => response({ ...payment }));
  jest.mocked(PaymentApi.confirmCash).mockImplementation(async () => {
    balance -= BigInt(payment.platformFee);
    payment = { ...payment, status: 'succeeded', paidAt: '2026-11-20T10:00:00Z' };
    ledger.unshift({ ...ledger[0]!, id: 'tx-commission', type: 'commission_debit', amount: payment.platformFee, referenceId: payment.id });
    return response({ ...payment });
  });
  jest.mocked(OrdersApi.getOrderDetail).mockResolvedValue(response({ id: 'order-1', orderCode: 'HG-CASH-1', workerUserId: 'worker-1', status: 'completed', agreedPrice: '200000', agreedScope: 'Sửa máy lạnh', paymentState: 'pending', addressText: 'Đà Nẵng' }) as Awaited<ReturnType<typeof OrdersApi.getOrderDetail>>);
  jest.mocked(OrdersApi.getStatusHistory).mockResolvedValue(response([]));

  render(<Journey />);
  await waitFor(() => expect(screen.getByTestId('worker-wallet-available')).toHaveTextContent('100.000 đ'));
  fireEvent.press(screen.getByTestId('worker-wallet-deposit-btn'));
  fireEvent.press(await screen.findByTestId('worker-deposit-open-btn'));
  expect(screen.getByTestId('topup-amount-input')).toHaveProp('value', '200.000');
  const trigger = screen.getByTestId('topup-sandbox-hidden-trigger');
  fireEvent.press(trigger);
  fireEvent.press(trigger);
  fireEvent.press(trigger);
  await screen.findByText('Nạp tiền thành công. Số dư ví đã được cập nhật.');
  fireEvent.press(screen.getByTestId('topup-close-btn'));
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  await waitFor(() => expect(screen.getByTestId('worker-wallet-available')).toHaveTextContent('300.000 đ'));
  fireEvent.press(screen.getByTestId('worker-wallet-history-btn'));
  expect(await screen.findByTestId('transaction-item-tx-topup')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  fireEvent.press(await screen.findByTestId('worker-wallet-withdraw-btn'));
  await screen.findByTestId('withdraw-bank-bank-1');
  expect(screen.queryByText('0123456789')).toBeNull();
  fireEvent.press(screen.getByTestId('withdraw-amount-100000'));
  fireEvent.press(screen.getByTestId('withdraw-confirm-btn'));
  fireEvent.press(screen.getByTestId('withdraw-confirm-btn'));
  await screen.findByTestId('withdrawal-withdrawal-1');
  await waitFor(() => expect(screen.getByTestId('withdraw-available')).toHaveTextContent('Khả dụng: 200.000 đ'));
  expect(screen.getByTestId('withdraw-reserved')).toHaveTextContent('Đang tạm giữ: 100.000 đ');
  expect(WalletApi.createWithdrawal).toHaveBeenCalledTimes(1);
  expect(WalletApi.createWithdrawal).toHaveBeenCalledWith({ amount: '100000', bankAccountId: 'bank-1', idempotencyKey: 'withdrawal-key' });
  fireEvent.press(screen.getByTestId('cancel-withdrawal-withdrawal-1'));
  await waitFor(() => expect(screen.getByTestId('withdraw-reserved')).toHaveTextContent('Đang tạm giữ: 0 đ'));
  expect(screen.getByTestId('withdraw-available')).toHaveTextContent('Khả dụng: 300.000 đ');
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  fireEvent.press(screen.getByTestId('worker-wallet-cash-payments-btn'));
  fireEvent.press(await screen.findByTestId('worker-cash-order-order-1'));
  fireEvent.press(await screen.findByTestId('worker-confirm-cash-btn'));
  expect(PaymentApi.confirmCash).not.toHaveBeenCalled();
  const buttons = alert.mock.calls.at(-1)?.[2];
  await act(async () => {
    buttons?.[1]?.onPress?.();
    buttons?.[1]?.onPress?.();
  });
  await screen.findByText('Đã xác nhận nhận tiền mặt');
  expect(PaymentApi.confirmCash).toHaveBeenCalledTimes(1);
  expect(balance).toBe(250000n);
  expect(reserved).toBe(0n);
  alert.mockRestore();
}, 15000);
