import type { OrderPaymentRecord, TopupRecord } from '../../types/payment.types';
import type { WalletData, WalletTransaction } from '../../types/wallet.types';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { CustomerLinkAccountScreen } from '@/features/profile/customer/screens/customer-link-account-screen';
import { CustomerPaymentScreen } from '@/features/profile/customer/screens/customer-payment-screen';
import { CustomerTransactionHistoryScreen } from '@/features/profile/customer/screens/customer-transaction-history-screen';
import { fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { OrderPaymentModal } from '../components/order-payment-modal';

let mockNavigate: (path: string) => void;
const mockStored = new Map<string, unknown>();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: (path: string) => mockNavigate(path), back: () => mockNavigate('/customer/payment') }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'journey-topup-key' }));
jest.mock('@shopify/flash-list', () => ({ FlashList: require('react-native').FlatList }));
jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: 'customer-1' }) } } }));
jest.mock('@/services/storage/storage-service', () => ({ StorageService: {
  getItem: (key: string) => mockStored.get(key) ?? null,
  setItem: (key: string, value: unknown) => mockStored.set(key, value),
  removeItem: (key: string) => mockStored.delete(key),
} }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyWallet: jest.fn(), getMyTransactions: jest.fn() } }));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { createTopup: jest.fn(), simulateTopup: jest.fn(), getTopupDetail: jest.fn(), openPayment: jest.fn(), payWithPoints: jest.fn() } }));

const response = <T,>(data: T) => ({ statusCode: 200, message: 'ok', data });
const onConfirm = jest.fn(async () => undefined);
const onPaid = jest.fn();
function Journey() {
  const [path, setPath] = useState('/customer/payment');
  useEffect(() => {
    mockNavigate = setPath;
  }, []);
  if (path.endsWith('transaction-history'))
    return <CustomerTransactionHistoryScreen />;
  if (path.endsWith('link-account'))
    return <CustomerLinkAccountScreen />;
  if (path === 'order')
    return <OrderPaymentModal orderId="order-1" amount="200000.00" serviceName="Sửa máy lạnh" workerName="Thợ A" needsConfirmation onConfirmCompletion={onConfirm} onResult={onPaid} onClose={() => setPath('/customer/payment')} />;
  return (
    <View className="flex-1">
      <CustomerPaymentScreen />
      <Pressable testID="journey-open-order" onPress={() => setPath('order')}><Text>Mở đơn kiểm thử</Text></Pressable>
    </View>
  );
}

it('shares balances, transaction history and saved preference through top-up and order settlement', async () => {
  mockStored.clear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let balance = 100000n;
  const ledger: WalletTransaction[] = [];
  let topupNumber = 0;
  const topups = new Map<string, TopupRecord>();
  const wallet: WalletData = { id: 'wallet-1', userId: 'customer-1', balance: '100000', availableBalance: '100000', reservedBalance: '0', status: 'active', createdAt: '', updatedAt: '' };
  const payment: OrderPaymentRecord = { id: 'payment-1', orderId: 'order-1', customerUserId: 'customer-1', workerUserId: 'worker-1', amount: '200000', currency: 'VND', method: 'point', status: 'pending', platformFee: '20000', workerEarning: '180000', orderCompletedAt: '2026-11-20', paidAt: null, createdAt: '', updatedAt: '' };
  jest.mocked(WalletApi.getMyWallet).mockImplementation(async () => response({ ...wallet, balance: String(balance), availableBalance: String(balance) }));
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(async (query) => {
    const items = ledger.filter(item => !query?.type || item.type === query.type);
    return response({ items: items.slice(0, query?.limit ?? 15), page: 1, limit: query?.limit ?? 15, total: items.length, totalPages: 1 });
  });
  jest.mocked(PaymentApi.createTopup).mockImplementation(async (payload) => {
    const record: TopupRecord = { id: `topup-${++topupNumber}`, amountVnd: String(payload.amountVnd), pointsToCredit: String(payload.amountVnd), provider: 'mock', isSimulated: true, simulationEndpoint: null, status: 'awaiting_payment', checkoutUrl: null, providerPaidAt: null, walletCreditedAt: null, expiresAt: '', createdAt: '' };
    topups.set(record.id, record);
    return response(record);
  });
  jest.mocked(PaymentApi.simulateTopup).mockImplementation(async id => response({ ...topups.get(id)!, status: 'credit_pending' }));
  jest.mocked(PaymentApi.getTopupDetail).mockImplementation(async (id) => {
    const record = topups.get(id)!;
    if (record.status !== 'completed') {
      balance += BigInt(record.amountVnd);
      record.status = 'completed';
      ledger.unshift({ id, type: 'topup', amount: record.amountVnd, status: 'completed', referenceId: id, description: 'Nạp kiểm thử', createdAt: '2026-11-20T14:30:00' });
    }
    return response({ ...record });
  });
  jest.mocked(PaymentApi.openPayment).mockResolvedValue(response(payment));
  jest.mocked(PaymentApi.payWithPoints).mockImplementation(async () => {
    balance -= BigInt(payment.amount);
    return response({ ...payment, status: 'succeeded' });
  });

  render(<Journey />);
  await screen.findByText('100.000 đ');
  fireEvent.press(screen.getByTestId('wallet-visibility-toggle'));
  expect(screen.getByTestId('wallet-balance-amount')).toHaveTextContent('••••••');
  fireEvent.press(screen.getByTestId('wallet-visibility-toggle'));
  fireEvent.press(screen.getByTestId('wallet-topup-btn'));
  fireEvent.changeText(screen.getByTestId('topup-amount-input'), '5.000');
  expect(screen.getByTestId('topup-vnpay-btn')).toHaveProp('accessibilityState', { disabled: true });
  fireEvent.press(screen.getByTestId('topup-amount-50000'));
  fireEvent.press(screen.getByTestId('topup-simulate-btn'));
  await waitFor(() => expect(screen.getByTestId('wallet-balance-amount')).toHaveTextContent('150.000 đ'), { timeout: 5000 });
  fireEvent.press(screen.getByTestId('topup-close-btn'));
  fireEvent.press(screen.getByTestId('payment-see-all-transactions-btn'));
  fireEvent.press(screen.getByTestId('transaction-filter-topup'));
  fireEvent.press(await screen.findByTestId('transaction-item-topup-1'));
  expect(screen.getByText('Mã giao dịch: topup-1')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('transaction-detail-close-btn'));
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  fireEvent.press(screen.getByTestId('payment-linked-btn'));
  await screen.findByText('Số dư khả dụng: 150.000 đ');
  fireEvent.press(screen.getByTestId('payment-method-cash'));
  await waitFor(() => expect(screen.getByTestId('payment-method-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false }));
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  fireEvent.press(screen.getByTestId('journey-open-order'));
  expect(screen.getByTestId('order-payment-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false });
  fireEvent.press(screen.getByTestId('order-payment-point'));
  await screen.findByText('Số dư ví không đủ (Còn thiếu 50.000 đ)');
  fireEvent.press(screen.getByTestId('order-payment-topup-btn'));
  expect(screen.getByTestId('topup-amount-input')).toHaveProp('value', '50.000');
  fireEvent.press(screen.getByTestId('topup-simulate-btn'));
  await screen.findByText('Đã thanh toán, đang chờ cộng điểm vào ví...');
  fireEvent.press(screen.getByTestId('topup-close-btn'));
  await screen.findByText('Số dư sau thanh toán: 0 đ', {}, { timeout: 5000 });
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', status: 'succeeded' })));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(PaymentApi.payWithPoints).toHaveBeenCalledTimes(1);
  expect(balance).toBe(0n);
  expect(topups.size).toBe(2);
  jest.restoreAllMocks();
}, 15000);
