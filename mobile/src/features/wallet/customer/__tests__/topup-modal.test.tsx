import type { TopupRecord } from '../../types/payment.types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useTopup } from '../../hooks/use-topup';
import { TopupModal } from '../components/topup-modal';

jest.mock('../../hooks/use-topup', () => ({ useTopup: jest.fn() }));

const record: TopupRecord = {
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
const createTopup = jest.fn<Promise<TopupRecord>, [number]>();
const startVnpayCheckout = jest.fn<Promise<void>, [string, string]>();
const simulateTopup = jest.fn<Promise<TopupRecord>, [string]>();

beforeEach(() => {
  jest.clearAllMocks();
  createTopup.mockResolvedValue(record);
  startVnpayCheckout.mockResolvedValue(undefined);
  simulateTopup.mockResolvedValue({ ...record, status: 'completed' });
  jest.mocked(useTopup).mockReturnValue({
    createTopup,
    startVnpayCheckout,
    simulateTopup,
    activeTopup: null,
    isCreating: false,
    isPolling: false,
    isSimulating: false,
    hasPollingTimedOut: false,
    cancelPolling: jest.fn(),
  });
});

it('selects 100k and shows its formatted value in the input', () => {
  render(<TopupModal visible onClose={jest.fn()} />);
  fireEvent.press(screen.getByTestId('topup-amount-100000'));
  expect(screen.getByTestId('topup-amount-input')).toHaveProp('value', '100.000');
  expect(screen.getByTestId('topup-vnpay-btn')).toHaveProp('accessibilityState', { disabled: false });
});

it('disables checkout and warns when the amount is below 10k', () => {
  render(<TopupModal visible onClose={jest.fn()} />);
  fireEvent.changeText(screen.getByTestId('topup-amount-input'), '9.000');
  expect(screen.getByText('Số tiền nạp tối thiểu là 10.000 đ.')).toBeOnTheScreen();
  expect(screen.getByTestId('topup-vnpay-btn')).toHaveProp('accessibilityState', { disabled: true });
  fireEvent.press(screen.getByTestId('topup-vnpay-btn'));
  expect(createTopup).not.toHaveBeenCalled();
});

it('creates a top-up and opens its VNPAY checkout URL', async () => {
  render(<TopupModal visible onClose={jest.fn()} />);
  fireEvent.press(screen.getByTestId('topup-amount-100000'));
  fireEvent.press(screen.getByTestId('topup-vnpay-btn'));
  await waitFor(() => expect(startVnpayCheckout).toHaveBeenCalledWith('https://example.com/checkout', 'topup-1'));
  expect(createTopup).toHaveBeenCalledWith(100_000);
});

it('creates a sandbox top-up and simulates it only with the mock provider', async () => {
  render(<TopupModal visible onClose={jest.fn()} />);
  fireEvent.press(screen.getByTestId('topup-amount-100000'));
  fireEvent.press(screen.getByTestId('topup-simulate-btn'));
  await waitFor(() => expect(simulateTopup).toHaveBeenCalledWith('topup-1'));
  expect(createTopup).toHaveBeenCalledWith(100_000);
  expect(startVnpayCheckout).not.toHaveBeenCalled();
});

it('shows a clear error if sandbox is unavailable on the backend', async () => {
  createTopup.mockResolvedValue({ ...record, isSimulated: false, provider: 'vnpay' });
  render(<TopupModal visible onClose={jest.fn()} />);
  fireEvent.press(screen.getByTestId('topup-amount-100000'));
  fireEvent.press(screen.getByTestId('topup-simulate-btn'));
  expect(await screen.findByText('Backend hiện chưa bật chế độ nạp thử.')).toBeOnTheScreen();
  expect(simulateTopup).not.toHaveBeenCalled();
});
