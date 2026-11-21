import type { OrderPaymentRecord, TopupRecord } from '../../types/payment.types';
import type { WalletData } from '../../types/wallet.types';
import { fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { ApiError } from '@/services/api/api-error';
import { PaymentApi } from '../../api/payment.api';
import { WalletApi } from '../../api/wallet.api';
import { OrderPaymentModal } from '../components/order-payment-modal';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'topup-key' }));
let mockPreferredMethod: 'cash' | null = null;
jest.mock('@/stores/use-auth-store', () => ({ useAuthStore: { use: { user: () => ({ id: 'customer-1' }) } } }));
jest.mock('@/services/storage/storage-service', () => ({ StorageService: { getItem: (key: string) => key.includes('preferred_payment_method') ? mockPreferredMethod : null, setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('../../api/wallet.api', () => ({ WalletApi: { getMyWallet: jest.fn() } }));
jest.mock('../../api/payment.api', () => ({ PaymentApi: { openPayment: jest.fn(), payWithPoints: jest.fn(), createTopup: jest.fn(), simulateTopup: jest.fn(), getTopupDetail: jest.fn() } }));
const response = <T,>(data: T) => ({ statusCode: 200, message: 'ok', data });
const wallet: WalletData = { id: 'wallet-1', userId: 'customer-1', balance: '500000', availableBalance: '500000', reservedBalance: '0', status: 'active', createdAt: '', updatedAt: '' };
const payment: OrderPaymentRecord = { id: 'payment-1', orderId: 'order-1', customerUserId: 'customer-1', workerUserId: 'worker-1', amount: '200000', currency: 'VND', method: 'point', status: 'pending', platformFee: '20000', workerEarning: '180000', refundedAmount: '0', orderCompletedAt: '2026-11-20', paidAt: null, createdAt: '', updatedAt: '' };
const confirm = jest.fn<Promise<unknown>, []>();
const onResult = jest.fn();
function mount(amount: string | number = '200000', needsConfirmation = true) {
  return render(<OrderPaymentModal orderId="order-1" amount={amount} serviceName="Sửa máy lạnh" workerName="Thợ A" needsConfirmation={needsConfirmation} onConfirmCompletion={confirm} onResult={onResult} onClose={jest.fn()} />);
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPreferredMethod = null;
  confirm.mockResolvedValue(undefined);
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response(wallet));
  jest.mocked(PaymentApi.openPayment).mockResolvedValue(response(payment));
  jest.mocked(PaymentApi.payWithPoints).mockResolvedValue(response({ ...payment, status: 'succeeded' }));
});

it('confirms completion before charging points and reports only settled success', async () => {
  mount('200000.00');
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' })));
  expect(PaymentApi.openPayment).toHaveBeenCalledWith({ orderId: 'order-1', method: 'point', expectedAmount: '200000' });
  expect(confirm.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(PaymentApi.openPayment).mock.invocationCallOrder[0]);
  expect(PaymentApi.payWithPoints).toHaveBeenCalledTimes(1);
});

it('blocks insufficient points, prefills top-up and preserves the order context on return', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, availableBalance: '100000' }));
  mount('300000');
  await screen.findByText('Số dư ví không đủ (Còn thiếu 200.000 đ)');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  expect(confirm).not.toHaveBeenCalled();
  expect(PaymentApi.openPayment).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('order-payment-topup-btn'));
  expect(screen.getByTestId('topup-amount-input')).toHaveProp('value', '200.000');
  fireEvent.press(screen.getByTestId('topup-close-btn'));
  expect(screen.getByText('Sửa máy lạnh')).toBeOnTheScreen();
  expect(screen.getByText('Thợ thực hiện: Thợ A')).toBeOnTheScreen();
});

it('allows cash with no wallet balance and leaves it pending worker confirmation', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, availableBalance: '0' }));
  jest.mocked(PaymentApi.openPayment).mockResolvedValue(response({ ...payment, method: 'cash' }));
  mount();
  fireEvent.press(screen.getByTestId('order-payment-cash'));
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ method: 'cash', status: 'pending' })));
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});

it('locks rapid duplicate submissions', async () => {
  let finish!: () => void;
  confirm.mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve(undefined);
  }));
  mount();
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  expect(confirm).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
  expect(PaymentApi.payWithPoints).toHaveBeenCalledTimes(1);
});

it('does not confirm completion twice when payment fails and is retried', async () => {
  jest.mocked(PaymentApi.openPayment).mockRejectedValueOnce(new Error('Payment not ready'));
  mount();
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await screen.findByText('Payment not ready');
  await waitFor(() => expect(screen.getByTestId('order-payment-confirm-btn')).toHaveProp('accessibilityState', { disabled: false }));
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
  expect(confirm).toHaveBeenCalledTimes(1);
});

it('does not charge if completion fails', async () => {
  confirm.mockRejectedValue(new Error('Không thể nghiệm thu'));
  mount();
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await screen.findByText('Không thể nghiệm thu');
  expect(PaymentApi.openPayment).not.toHaveBeenCalled();
  expect(onResult).not.toHaveBeenCalled();
});

it('does not charge again when the backend already reports processing', async () => {
  jest.mocked(PaymentApi.openPayment).mockResolvedValue(response({ ...payment, status: 'processing' }));
  mount('200000', false);
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing' })));
  expect(confirm).not.toHaveBeenCalled();
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
});

it('returns from sandbox top-up to an updated balance and can settle the same order', async () => {
  jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, availableBalance: '100000' }));
  const topup: TopupRecord = { id: 'topup-1', amountVnd: '100000', pointsToCredit: '100000', provider: 'mock', isSimulated: true, simulationEndpoint: null, status: 'awaiting_payment', checkoutUrl: null, providerPaidAt: null, walletCreditedAt: null, expiresAt: '', createdAt: '' };
  jest.mocked(PaymentApi.createTopup).mockResolvedValue(response(topup));
  jest.mocked(PaymentApi.simulateTopup).mockResolvedValue(response({ ...topup, status: 'credit_pending' }));
  jest.mocked(PaymentApi.getTopupDetail).mockImplementation(async () => {
    jest.mocked(WalletApi.getMyWallet).mockResolvedValue(response({ ...wallet, availableBalance: '200000' }));
    return response({ ...topup, status: 'completed' as const });
  });
  mount();
  await screen.findByText('Số dư ví không đủ (Còn thiếu 100.000 đ)');
  fireEvent.press(screen.getByTestId('order-payment-topup-btn'));
  fireEvent.press(screen.getByTestId('topup-simulate-btn'));
  await screen.findByText('Đã thanh toán, đang chờ cộng điểm vào ví...');
  fireEvent.press(screen.getByTestId('topup-close-btn'));
  await screen.findByText('Số dư sau thanh toán: 0 đ', {}, { timeout: 5000 });
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', status: 'succeeded' })));
});

it.each(['0', '-1', '1.5', 'invalid'])('blocks an invalid total %s', async (amount) => {
  mount(amount);
  expect(screen.getByTestId('order-payment-confirm-btn')).toHaveProp('accessibilityState', { disabled: true });
  expect(screen.getByText('Chi phí không hợp lệ. Vui lòng tải lại đơn hàng.')).toBeOnTheScreen();
  await screen.findByText('Số dư ví: 500.000 đ');
});

it('uses the saved default from the payment methods screen', async () => {
  mockPreferredMethod = 'cash';
  mount();
  expect(screen.getByTestId('order-payment-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false });
  await screen.findByText('Số dư ví: 500.000 đ');
});

it('shows the server-selected payment method when reopening a pending payment', async () => {
  render(<OrderPaymentModal orderId="order-1" amount="200000" serviceName="Sửa máy lạnh" workerName="Thợ A" initialMethod="cash" needsConfirmation={false} onConfirmCompletion={confirm} onResult={onResult} onClose={jest.fn()} />);
  expect(screen.getByTestId('order-payment-cash')).toHaveProp('accessibilityState', { checked: true, disabled: false });
});

it('does not report success for a failed point charge', async () => {
  jest.mocked(PaymentApi.payWithPoints).mockResolvedValue(response({ ...payment, status: 'failed' }));
  mount();
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await screen.findByText('Thanh toán chưa thành công. Vui lòng kiểm tra và thử lại.');
  expect(onResult).not.toHaveBeenCalled();
});

it('keeps completion confirmed while a missing backend payment is retried without double charging', async () => {
  jest.mocked(PaymentApi.openPayment).mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'Payment is not ready for this order yet', { statusCode: 409 }));
  mount();
  await screen.findByText('Số dư sau thanh toán: 300.000 đ');
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  expect(await screen.findByTestId('order-payment-error')).toHaveTextContent('Đơn đã được nghiệm thu nhưng hệ thống chưa sẵn sàng thanh toán. Lần thử này chưa trừ tiền ví. Vui lòng thử lại sau.');
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(PaymentApi.payWithPoints).not.toHaveBeenCalled();
  expect(onResult).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('order-payment-confirm-btn'));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' })));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(PaymentApi.payWithPoints).toHaveBeenCalledTimes(1);
});
