import type { WalletTransaction } from '../../types/wallet.types';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { transactionTime } from '../../utils/transaction-display';
import { TransactionItem } from '../components/transaction-item';

const transaction: WalletTransaction = { id: 'tx-1', type: 'topup', amount: '100000', status: 'completed', referenceId: null, description: null, createdAt: '2026-11-20T14:30:00' };

it('shows a green credit, Vietnamese date and passes the transaction on press', () => {
  const onPress = jest.fn();
  render(<TransactionItem transaction={transaction} onPress={onPress} />);
  expect(screen.getByText('+100.000 đ')).toBeOnTheScreen();
  expect(screen.getByTestId('transaction-amount-tx-1').props.className).toContain('text-emerald-700');
  expect(screen.getByText('14:30 - 20/11/2026')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('transaction-item-tx-1'));
  expect(onPress).toHaveBeenCalledWith(transaction);
});

it('shows debit and order reference without losing integer precision', () => {
  render(<TransactionItem transaction={{ ...transaction, type: 'payment_debit', amount: '9007199254740993', referenceId: 'HG-1024' }} onPress={jest.fn()} />);
  expect(screen.getByText('-9.007.199.254.740.993 đ')).toBeOnTheScreen();
  expect(screen.getByText('Thanh toán đơn việc #HG-1024')).toBeOnTheScreen();
});

it('does not invent a direction for an admin adjustment', () => {
  render(<TransactionItem transaction={{ ...transaction, type: 'admin_adjustment' }} onPress={jest.fn()} />);
  expect(screen.getByText('100.000 đ')).toBeOnTheScreen();
  expect(transactionTime('invalid')).toBe('Chưa có thời gian');
});
