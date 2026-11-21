import type { TopupRecord } from '../../types/payment.types';
import type { WalletData, WalletTransaction } from '../../types/wallet.types';
import { CustomerPaymentScreen } from '@/features/profile/customer/screens/customer-payment-screen';
import { fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'topup-key-1' }));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: { use: { user: () => ({ id: 'customer-1' }) } },
}));
jest.mock('@/services/storage/storage-service', () => ({
  StorageService: { getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/features/wallet/api/wallet.api', () => ({
  WalletApi: { getMyWallet: jest.fn(), getMyTransactions: jest.fn() },
}));
jest.mock('@/features/wallet/api/payment.api', () => ({
  PaymentApi: { createTopup: jest.fn(), simulateTopup: jest.fn(), getTopupDetail: jest.fn() },
}));

const wallet: WalletData = {
  id: 'wallet-1',
  userId: 'customer-1',
  balance: '0',
  reservedBalance: '0',
  availableBalance: '0',
  status: 'active',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const topup: TopupRecord = {
  id: 'topup-1',
  amountVnd: '100000',
  pointsToCredit: '100000',
  provider: 'mock',
  isSimulated: true,
  simulationEndpoint: '/payments/topups/topup-1/simulate',
  status: 'awaiting_payment',
  checkoutUrl: 'https://example.com/checkout',
  providerPaidAt: null,
  walletCreditedAt: null,
  expiresAt: '2026-01-01',
  createdAt: '2026-01-01',
};
const response = <T,>(data: T) => ({ statusCode: 200, message: 'ok', data });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response(wallet));
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({ items: [], page: 1, limit: 3, total: 0, totalPages: 0 }));
});

it('shows three recent transactions from the wallet service', async () => {
  const transaction = (id: string): WalletTransaction => ({
    id,
    type: 'topup',
    amount: '10000',
    status: 'completed',
    referenceId: null,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
  });
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response({
    items: [transaction('tx-1'), transaction('tx-2'), transaction('tx-3')],
    page: 1,
    limit: 3,
    total: 3,
    totalPages: 1,
  }));
  render(<CustomerPaymentScreen />);
  await waitFor(() => expect(screen.getByTestId('wallet-balance-amount')).toHaveTextContent('0 đ'));
  await waitFor(() => expect(screen.getAllByText('Nạp tiền vào ví')).toHaveLength(3));
  expect(WalletApi.getMyTransactions).toHaveBeenCalledWith({ page: 1, limit: 3 });
});

it('updates the visible wallet balance after sandbox settlement completes', async () => {
  jest.mocked(WalletApi.getMyWallet)
    .mockResolvedValueOnce(response(wallet))
    .mockResolvedValue(response({ ...wallet, balance: '100000', availableBalance: '100000' }));
  jest.mocked(PaymentApi.createTopup).mockResolvedValue(response(topup));
  jest.mocked(PaymentApi.simulateTopup).mockResolvedValue(response({ ...topup, status: 'credit_pending' }));
  jest.mocked(PaymentApi.getTopupDetail).mockResolvedValue(response({ ...topup, status: 'completed' }));

  render(<CustomerPaymentScreen />);
  await waitFor(() => expect(screen.getByTestId('wallet-balance-amount')).toHaveTextContent('0 đ'));
  fireEvent.press(screen.getByTestId('wallet-topup-btn'));
  fireEvent.press(screen.getByTestId('topup-amount-100000'));
  fireEvent.press(screen.getByTestId('topup-simulate-btn'));

  await waitFor(() => expect(PaymentApi.simulateTopup).toHaveBeenCalledWith('topup-1', 'succeeded'));
  await waitFor(() => expect(PaymentApi.getTopupDetail).toHaveBeenCalledWith('topup-1'), { timeout: 5_000 });
  await waitFor(() => expect(screen.getByTestId('wallet-balance-amount')).toHaveTextContent('100.000 đ'), { timeout: 5_000 });
  expect(WalletApi.getMyWallet).toHaveBeenCalledTimes(2);
});
