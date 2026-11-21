import type { WalletData } from '../../types/wallet.types';
import { StorageKeys } from '@/constants/storage-keys';
import { CustomerLinkAccountScreen } from '@/features/profile/customer/screens/customer-link-account-screen';
import { fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { ApiError } from '@/services/api/api-error';
import { StorageService } from '@/services/storage/storage-service';
import { WalletApi } from '../../api/wallet.api';

const mockBack = jest.fn();
let mockUserId: string | null = 'customer-1';
const mockStored = new Map<string, unknown>();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => mockUserId ? { id: mockUserId } : null } } }));
jest.mock('@/services/storage/storage-service', () => ({ StorageService: {
  getItem: jest.fn((key: string) => mockStored.get(key) ?? null),
  setItem: jest.fn((key: string, value: unknown) => mockStored.set(key, value)),
} }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyWallet: jest.fn() } }));
jest.mock('../../hooks/use-topup', () => ({ useTopup: () => ({}) }));

const wallet: WalletData = { id: 'wallet-1', userId: 'customer-1', balance: '300000', reservedBalance: '50000', availableBalance: '250000', status: 'active', createdAt: '2026-11-20', updatedAt: '2026-11-20' };
const response = (data: WalletData) => ({ statusCode: 200, message: 'ok', data });
beforeEach(() => {
  jest.clearAllMocks();
  mockStored.clear();
  mockUserId = 'customer-1';
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response(wallet));
});

it('shows three distinct methods and backend available balance', async () => {
  render(<CustomerLinkAccountScreen />);
  await screen.findByText('Số dư khả dụng: 250.000 đ');
  expect(screen.getByTestId('payment-method-point')).toBeOnTheScreen();
  expect(screen.getByTestId('payment-method-cash')).toBeOnTheScreen();
  expect(screen.getByTestId('payment-method-vnpay')).toBeOnTheScreen();
  expect(screen.getByTestId('payment-method-point')).toHaveProp('accessibilityState', { checked: true, disabled: false });
  expect(screen.getByTestId('customer-link-account-screen')).toBeOnTheScreen();
});

it('persists a changed default and restores it on remount', async () => {
  const view = render(<CustomerLinkAccountScreen />);
  fireEvent.press(screen.getByTestId('payment-method-cash'));
  await waitFor(() => expect(screen.getByTestId('payment-method-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false }));
  expect(StorageService.setItem).toHaveBeenCalledWith(StorageKeys.PREFERRED_PAYMENT_METHOD('customer-1'), 'cash');
  view.unmount();
  render(<CustomerLinkAccountScreen />);
  expect(screen.getByTestId('payment-method-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false });
  fireEvent.press(screen.getByTestId('payment-method-point'));
  expect(StorageService.setItem).toHaveBeenLastCalledWith(StorageKeys.PREFERRED_PAYMENT_METHOD('customer-1'), 'point');
  await screen.findByText('Số dư khả dụng: 250.000 đ');
});

it('isolates preferences between accounts and rejects invalid stored values', async () => {
  mockStored.set(StorageKeys.PREFERRED_PAYMENT_METHOD('customer-1'), 'cash');
  mockStored.set(StorageKeys.PREFERRED_PAYMENT_METHOD('customer-2'), 'vnpay');
  const view = render(<CustomerLinkAccountScreen />);
  expect(screen.getByTestId('payment-method-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false });
  mockUserId = 'customer-2';
  view.rerender(<CustomerLinkAccountScreen />);
  expect(screen.getByTestId('payment-method-point')).toHaveProp('accessibilityState', { checked: true, disabled: false });
  await screen.findByText('Số dư khả dụng: 250.000 đ');
});

it('opens the existing top-up flow and closes it', async () => {
  render(<CustomerLinkAccountScreen />);
  await screen.findByText('Số dư khả dụng: 250.000 đ');
  fireEvent.press(screen.getByTestId('payment-method-topup-btn'));
  expect(screen.getByText('Nạp điểm vào Ví HandyGo')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('topup-close-btn'));
  expect(screen.queryByText('Nạp điểm vào Ví HandyGo')).toBeNull();
});

it('disables top-up for frozen wallets but allows choosing cash', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, status: 'frozen' }));
  render(<CustomerLinkAccountScreen />);
  await screen.findByText('Ví hiện không hoạt động');
  expect(screen.getByTestId('payment-method-topup-btn')).toHaveProp('accessibilityState', { disabled: true });
  fireEvent.press(screen.getByTestId('payment-method-cash'));
  await waitFor(() => expect(screen.getByTestId('payment-method-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false }));
});

it('shows a missing wallet without inventing a zero balance', async () => {
  jest.mocked(WalletApi.getMyWallet).mockRejectedValue(new ApiError('NOT_FOUND', 'Not found', { statusCode: 404 }));
  render(<CustomerLinkAccountScreen />);
  await screen.findByText('Ví của bạn chưa sẵn sàng');
  expect(screen.queryByTestId('payment-method-wallet-balance')).toBeNull();
  expect(screen.getByTestId('payment-method-topup-btn')).toHaveProp('accessibilityState', { disabled: true });
});

it('uses the provided back callback or router back', async () => {
  const onBack = jest.fn();
  const view = render(<CustomerLinkAccountScreen onBack={onBack} />);
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  expect(onBack).toHaveBeenCalledTimes(1);
  view.rerender(<CustomerLinkAccountScreen />);
  fireEvent.press(screen.getByTestId('app-bar-back-btn'));
  expect(mockBack).toHaveBeenCalledTimes(1);
  await screen.findByText('Số dư khả dụng: 250.000 đ');
});

it('shows loading, then an error with retry instead of a fabricated balance', async () => {
  jest.mocked(WalletApi.getMyWallet).mockRejectedValue(new Error('offline'));
  render(<CustomerLinkAccountScreen />);
  expect(screen.getByLabelText('Đang tải số dư ví')).toBeOnTheScreen();
  const retry = await screen.findByText('Thử tải lại số dư', {}, { timeout: 6000 });
  expect(screen.queryByTestId('payment-method-wallet-balance')).toBeNull();
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response(wallet));
  fireEvent.press(retry);
  await screen.findByText('Số dư khả dụng: 250.000 đ');
});

it('does not save a default for a signed-out user', async () => {
  mockUserId = null;
  render(<CustomerLinkAccountScreen />);
  fireEvent.press(screen.getByTestId('payment-method-cash'));
  expect(StorageService.setItem).not.toHaveBeenCalled();
  expect(screen.getByText('Đăng nhập để lưu phương thức mặc định.')).toBeOnTheScreen();
  await screen.findByText('Số dư khả dụng: 250.000 đ');
});
