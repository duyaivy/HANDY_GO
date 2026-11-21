import { fireEvent, render, screen } from '@/lib/test-utils';
import { PaymentApi } from '../../api/payment.api';
import { WorkerCashPaymentsScreen } from '../screens/worker-cash-payments-screen';
import { response, workerPayment } from './fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: require('react-native').FlatList }));
jest.mock('@shopify/flash-list/jestSetup', () => ({}));
jest.mock('@/stores/use-auth-store', () => ({
  useAuthStore: { use: { user: () => ({ id: 'worker-1' }) } },
}));
jest.mock('../../api/payment.api', () => ({
  PaymentApi: { getMyPayments: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('renders empty message when there are no pending cash payments', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValue(
    response({ items: [], page: 1, limit: 15, total: 0, totalPages: 0 }),
  );

  render(<WorkerCashPaymentsScreen />);
  expect(await screen.findByText('Không có đơn tiền mặt chờ xác nhận.')).toBeOnTheScreen();
});

it('renders pending cash payments and deduplicates overlapping items between pages', async () => {
  const payment1 = { ...workerPayment, id: 'cash-1', orderId: 'order-1', amount: '150000' };
  const payment2 = { ...workerPayment, id: 'cash-2', orderId: 'order-2', amount: '250000' };

  // Page 1 returns cash-1 and cash-2
  // Page 2 returns cash-2 (shifted due to concurrent insert) and cash-3
  const payment3 = { ...workerPayment, id: 'cash-3', orderId: 'order-3', amount: '350000' };

  jest.mocked(PaymentApi.getMyPayments).mockImplementation(async ({ page } = {}) => {
    if (page === 1) {
      return response({
        items: [payment1, payment2],
        page: 1,
        limit: 15,
        total: 3,
        totalPages: 2,
      });
    }
    return response({
      items: [payment2, payment3], // payment2 duplicated across pages
      page: 2,
      limit: 15,
      total: 3,
      totalPages: 2,
    });
  });

  render(<WorkerCashPaymentsScreen />);
  await screen.findByTestId('worker-cash-order-order-1');
  await screen.findByTestId('worker-cash-order-order-2');

  // Trigger pagination / scroll
  fireEvent(screen.getByTestId('worker-cash-payments-list'), 'onEndReached');

  await screen.findByTestId('worker-cash-order-order-3');

  // Verify deduplication: order-2 is rendered only once
  expect(screen.getAllByTestId('worker-cash-order-order-2')).toHaveLength(1);

  // Press item navigates to worker job detail
  fireEvent.press(screen.getByTestId('worker-cash-order-order-1'));
  expect(mockPush).toHaveBeenCalledWith('/worker/jobs/order-1');
});

it('renders error state and retries successfully', async () => {
  jest.mocked(PaymentApi.getMyPayments).mockRejectedValueOnce(new Error('Network error'));

  render(<WorkerCashPaymentsScreen />);
  await screen.findByText('Không thể tải đơn tiền mặt. Chạm để thử lại.');

  // Mock success on retry
  jest.mocked(PaymentApi.getMyPayments).mockResolvedValueOnce(
    response({ items: [workerPayment], page: 1, limit: 15, total: 1, totalPages: 1 }),
  );

  fireEvent.press(screen.getByText('Không thể tải đơn tiền mặt. Chạm để thử lại.'));
  await screen.findByTestId(`worker-cash-order-${workerPayment.orderId}`);
});
