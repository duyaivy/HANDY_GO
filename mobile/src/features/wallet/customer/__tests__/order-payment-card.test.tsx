import { render, screen } from '@testing-library/react-native';
import { OrderPaymentCard } from '@/features/orders/components/order-payment-card';

it.each([
  ['paid', 'Đã thanh toán'],
  ['pending', 'Chờ xác nhận'],
  ['unpaid', 'Chờ thanh toán'],
  ['refunded', 'Đã hoàn tiền'],
] as const)('shows %s with the actual payment method and exact amount', (paymentState, label) => {
  render(<OrderPaymentCard agreedPrice="9007199254740993" paymentState={paymentState} paymentMethod="point" />);
  expect(screen.getByText(label)).toBeOnTheScreen();
  expect(screen.getByText('Điểm ví HandyGo')).toBeOnTheScreen();
  expect(screen.getAllByText('9.007.199.254.740.993 đ')).toHaveLength(2);
});

it('accepts an exact Decimal order price without rounding fractions', () => {
  const view = render(<OrderPaymentCard agreedPrice="200000.00" />);
  expect(screen.getAllByText('200.000 đ')).toHaveLength(2);
  view.rerender(<OrderPaymentCard agreedPrice="200000.50" />);
  expect(screen.getAllByText('Chưa xác định')).toHaveLength(2);
});
