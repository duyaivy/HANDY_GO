import type { WalletTransaction } from '../../types/wallet.types';
import { CustomerTransactionHistoryScreen } from '@/features/profile/customer/screens/customer-transaction-history-screen';
import { act, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { WalletApi } from '../../api/wallet.api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
// Native recycling/layout is owned by FlashList; exercise list callbacks with RN's testable list.
jest.mock('@shopify/flash-list', () => ({ FlashList: require('react-native').FlatList }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyTransactions: jest.fn() } }));

const tx = (id: string, type: WalletTransaction['type'] = 'topup'): WalletTransaction => ({ id, type, amount: '100000', status: 'completed', referenceId: 'HG-1024', description: 'Giao dịch kiểm thử', createdAt: '2026-11-20T14:30:00' });
const response = (items: WalletTransaction[], page = 1, totalPages = 1) => ({ statusCode: 200, message: 'ok', data: { items, page, limit: 15, total: items.length, totalPages } });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response([]));
});

it('renders ten transactions and opens/closes details with support navigation', async () => {
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response(Array.from({ length: 10 }, (_, i) => tx(`tx-${i}`))));
  render(<CustomerTransactionHistoryScreen />);
  await waitFor(() => expect(screen.getAllByTestId(/^transaction-item-/)).toHaveLength(10));
  fireEvent.press(screen.getByTestId('transaction-item-tx-0'));
  expect(screen.getByText('Mã giao dịch: tx-0')).toBeOnTheScreen();
  expect(screen.getByText('Mã tham chiếu: HG-1024')).toBeOnTheScreen();
  expect(screen.getByText('Thành công')).toBeOnTheScreen();
  expect(screen.getByText('Nội dung: Giao dịch kiểm thử')).toBeOnTheScreen();
  expect(screen.getByText('Số dư trước giao dịch: Chưa được cung cấp')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('transaction-detail-close-btn'));
  expect(screen.queryByTestId('transaction-detail-modal')).toBeNull();
  fireEvent.press(screen.getByTestId('transaction-item-tx-0'));
  fireEvent.press(screen.getByTestId('transaction-support-btn'));
  expect(mockPush).toHaveBeenCalledWith('/customer/support');
});

it('queries each backend filter and replaces the previous list', async () => {
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(async params => response([tx(params?.type ?? 'all', params?.type ?? 'topup')]));
  render(<CustomerTransactionHistoryScreen />);
  await screen.findByTestId('transaction-item-all');
  for (const type of ['topup', 'payment_debit', 'refund_credit'] as const) {
    fireEvent.press(screen.getByTestId(`transaction-filter-${type}`));
    await screen.findByTestId(`transaction-item-${type}`);
    expect(WalletApi.getMyTransactions).toHaveBeenCalledWith({ page: 1, limit: 15, type });
    expect(screen.queryByTestId('transaction-item-all')).toBeNull();
  }
  fireEvent.press(screen.getByTestId('transaction-filter-all'));
  await screen.findByTestId('transaction-item-all');
  expect(screen.queryByTestId('transaction-item-refund_credit')).toBeNull();
});

it('offers worker earning, commission and withdrawal filters for the worker route', async () => {
  render(<CustomerTransactionHistoryScreen worker />);
  await screen.findByTestId('transaction-empty');
  for (const type of ['worker_earning', 'commission_debit', 'withdrawal', 'refund_recovery'] as const) {
    fireEvent.press(screen.getByTestId(`transaction-filter-${type}`));
    await waitFor(() => expect(WalletApi.getMyTransactions).toHaveBeenLastCalledWith({ page: 1, limit: 15, type }));
  }
  expect(screen.queryByTestId('transaction-filter-payment_debit')).toBeNull();
});

it('loads the next page without duplicates and refreshes', async () => {
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(async params => params?.page === 2
    ? response([tx('tx-1'), tx('tx-2')], 2, 2)
    : response([tx('tx-1')], 1, 2));
  render(<CustomerTransactionHistoryScreen />);
  await screen.findByTestId('transaction-item-tx-1');
  fireEvent(screen.getByTestId('transaction-history-list'), 'onEndReached');
  await screen.findByTestId('transaction-item-tx-2');
  expect(screen.getAllByTestId('transaction-item-tx-1')).toHaveLength(1);
  const refreshControl = screen.getByTestId('transaction-history-list').props.refreshControl;
  await act(async () => refreshControl.props.onRefresh());
  await waitFor(() => expect(WalletApi.getMyTransactions).toHaveBeenCalledTimes(4));
});

it('shows an empty state', async () => {
  render(<CustomerTransactionHistoryScreen />);
  await screen.findByTestId('transaction-empty');
});

it('ignores a late response from a previously selected filter', async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(params => params?.type === 'topup'
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve(response([tx(params?.type ?? 'all', params?.type ?? 'topup')])));
  render(<CustomerTransactionHistoryScreen />);
  await screen.findByTestId('transaction-item-all');
  fireEvent.press(screen.getByTestId('transaction-filter-topup'));
  await waitFor(() => expect(resolveOld).toBeDefined());
  fireEvent.press(screen.getByTestId('transaction-filter-payment_debit'));
  await screen.findByTestId('transaction-item-payment_debit');
  await act(async () => resolveOld(response([tx('late-topup')])));
  expect(screen.queryByTestId('transaction-item-late-topup')).toBeNull();
  expect(screen.getByTestId('transaction-item-payment_debit')).toBeOnTheScreen();
});

it('keeps previous rows on a next-page error and retries explicitly', async () => {
  jest.mocked(WalletApi.getMyTransactions).mockImplementation(async (params) => {
    if (params?.page === 2)
      throw new Error('offline');
    return response([tx('tx-1')], 1, 2);
  });
  render(<CustomerTransactionHistoryScreen />);
  await screen.findByTestId('transaction-item-tx-1');
  fireEvent(screen.getByTestId('transaction-history-list'), 'onEndReached');
  const retry = await screen.findByText('Tải thêm thất bại. Chạm để thử lại.');
  expect(screen.getByTestId('transaction-item-tx-1')).toBeOnTheScreen();
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response([tx('tx-2')], 2, 2));
  fireEvent.press(retry);
  await screen.findByTestId('transaction-item-tx-2');
});

it('shows loading then a recoverable error', async () => {
  jest.mocked(WalletApi.getMyTransactions).mockRejectedValue(new Error('offline'));
  render(<CustomerTransactionHistoryScreen />);
  expect(screen.getByTestId('transaction-loading')).toBeOnTheScreen();
  const retry = await screen.findByText('Không thể tải giao dịch. Chạm để thử lại.');
  jest.mocked(WalletApi.getMyTransactions).mockResolvedValue(response([tx('recovered')]));
  fireEvent.press(retry);
  await screen.findByTestId('transaction-item-recovered');
});
