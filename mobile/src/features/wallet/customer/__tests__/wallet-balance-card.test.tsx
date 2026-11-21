import type { WalletData } from '../../types/wallet.types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StorageKeys } from '@/constants/storage-keys';
import { StorageService } from '@/services/storage/storage-service';
import { WalletBalanceCard } from '../components/wallet-balance-card';

jest.mock('@/services/storage/storage-service', () => ({
  StorageService: { getItem: jest.fn(), setItem: jest.fn() },
}));

const wallet: WalletData = {
  id: 'wallet-1',
  userId: 'customer-1',
  balance: '125000',
  reservedBalance: '25000',
  availableBalance: '100000',
  status: 'active',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const onTopup = jest.fn();
const onHistory = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(StorageService.getItem).mockReturnValue(null);
});

it('shows backend available and reserved balances and action buttons', () => {
  render(<WalletBalanceCard wallet={wallet} onTopup={onTopup} onHistory={onHistory} />);
  expect(screen.getByText('100.000 đ')).toBeOnTheScreen();
  expect(screen.getByText('100.000 điểm')).toBeOnTheScreen();
  expect(screen.getByText('Đang tạm giữ: 25.000 đ')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('wallet-topup-btn'));
  fireEvent.press(screen.getByTestId('wallet-history-btn'));
  expect(onTopup).toHaveBeenCalledTimes(1);
  expect(onHistory).toHaveBeenCalledTimes(1);
});

it('hides all monetary values and persists the privacy choice', () => {
  render(<WalletBalanceCard wallet={wallet} onTopup={onTopup} onHistory={onHistory} />);
  fireEvent.press(screen.getByTestId('wallet-visibility-toggle'));
  expect(screen.getByTestId('wallet-balance-amount')).toHaveTextContent('••••••');
  expect(screen.queryByText('100.000 điểm')).toBeNull();
  expect(screen.queryByText('Đang tạm giữ: 25.000 đ')).toBeNull();
  expect(StorageService.setItem).toHaveBeenCalledWith(StorageKeys.WALLET_BALANCE_HIDDEN, true);
});

it('does not show a fabricated balance when the wallet is missing', () => {
  render(<WalletBalanceCard isWalletNotFound onTopup={onTopup} onHistory={onHistory} />);
  expect(screen.getByText('Ví của bạn chưa sẵn sàng')).toBeOnTheScreen();
  expect(screen.queryByTestId('wallet-balance-amount')).toBeNull();
  fireEvent.press(screen.getByTestId('wallet-topup-btn'));
  expect(onTopup).not.toHaveBeenCalled();
});
