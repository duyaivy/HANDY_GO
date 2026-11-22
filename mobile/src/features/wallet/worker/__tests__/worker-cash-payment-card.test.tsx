import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@/lib/test-utils';
import { PaymentApi } from '../../api/payment.api';
import { WorkerCashPaymentCard } from '../components/worker-cash-payment-card';
import { response, workerPayment } from './fixtures';

jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: 'worker-1' }) } } }));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { getPaymentByOrder: jest.fn(), confirmCash: jest.fn() } }));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(PaymentApi.getPaymentByOrder).mockResolvedValue(response(workerPayment));
  jest.mocked(PaymentApi.confirmCash).mockResolvedValue(response({ ...workerPayment, status: 'succeeded' }));
});
afterEach(() => jest.restoreAllMocks());
it('never queries or confirms an incomplete order', () => {
  render(<WorkerCashPaymentCard orderId="order-1" completed={false} />);
  expect(PaymentApi.getPaymentByOrder).not.toHaveBeenCalled();
  expect(screen.queryByTestId('worker-cash-payment-card')).toBeNull();
});
it.each([
  { status: 'processing' as const },
  { status: 'succeeded' as const },
  { status: 'cancelled' as const },
  { status: 'refunded' as const },
  { status: 'partially_refunded' as const },
  { method: 'point' as const },
  { workerUserId: 'another-worker' },
  { orderCompletedAt: null },
])('does not offer confirmation for an ineligible payment %j', async (changes) => {
  jest.mocked(PaymentApi.getPaymentByOrder).mockResolvedValue(response({ ...workerPayment, ...changes }));
  render(<WorkerCashPaymentCard orderId="order-1" completed />);
  await screen.findByTestId('worker-payment-status');
  expect(screen.queryByTestId('worker-confirm-cash-btn')).toBeNull();
});
it('requires an explicit positive confirmation and leaves failure unpaid', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(PaymentApi.confirmCash).mockRejectedValue(new Error('Không thể xác nhận lúc này'));
  render(<WorkerCashPaymentCard orderId="order-1" completed />);
  fireEvent.press(await screen.findByTestId('worker-confirm-cash-btn'));
  expect(PaymentApi.confirmCash).not.toHaveBeenCalled();
  expect(alert.mock.calls[0]?.[2]?.[0]).toMatchObject({ text: 'Chưa nhận', style: 'cancel' });
  await act(async () => {
    alert.mock.calls[0]?.[2]?.[1]?.onPress?.();
  });
  expect(await screen.findByTestId('worker-confirm-cash-error')).toHaveTextContent('Không thể xác nhận lúc này');
  expect(screen.getByTestId('worker-payment-status')).toHaveTextContent('Chờ thợ xác nhận nhận tiền mặt');
  expect(screen.queryByText('Đã xác nhận nhận tiền mặt')).toBeNull();
});
it('allows retrying a failed cash payment after explicit confirmation', async () => {
  const payment = { ...workerPayment, status: 'failed' as const };
  jest.mocked(PaymentApi.getPaymentByOrder).mockResolvedValue(response(payment));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  render(<WorkerCashPaymentCard orderId="order-1" completed />);
  fireEvent.press(await screen.findByTestId('worker-confirm-cash-btn'));
  jest.mocked(PaymentApi.getPaymentByOrder).mockResolvedValue(response({ ...payment, status: 'succeeded' }));
  await act(async () => {
    alert.mock.calls[0]?.[2]?.[1]?.onPress?.();
  });
  expect(await screen.findByText('Đã xác nhận nhận tiền mặt')).toBeOnTheScreen();
  expect(PaymentApi.confirmCash).toHaveBeenCalledWith(payment.id);
});
