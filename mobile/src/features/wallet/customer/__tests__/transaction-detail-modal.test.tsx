import type { WalletTransaction } from '../../types/wallet.types';
import { render, screen } from '@testing-library/react-native';
import { TransactionDetailModal } from '../components/transaction-detail-modal';

it.each([
  ['pending', 'Đang xử lý'],
  ['failed', 'Thất bại'],
  ['reversed', 'Đã đảo giao dịch'],
] as const)('shows the actual %s status instead of success', (status, label) => {
  const transaction: WalletTransaction = { id: 'tx-1', type: 'payment_debit', amount: '250000', status, referenceId: null, description: null, createdAt: '2026-11-20T14:30:00' };
  render(<TransactionDetailModal transaction={transaction} onClose={jest.fn()} onSupport={jest.fn()} />);
  expect(screen.getByText(label)).toBeOnTheScreen();
  expect(screen.getByText('-250.000 đ')).toBeOnTheScreen();
  expect(screen.queryByText('Thành công')).toBeNull();
  expect(screen.getByText('Mã tham chiếu: Không có')).toBeOnTheScreen();
  expect(screen.getByText('Nội dung: Không có nội dung')).toBeOnTheScreen();
});

it.each([
  ['5000000', '4444445', '5.000.000 đ', '4.444.445 đ'],
  ['5200000', '5699999', '5.200.000 đ', '5.699.999 đ'],
  ['0', '9007199254740993', '0 đ', '9.007.199.254.740.993 đ'],
])('renders recorded before/after snapshots (%s -> %s)', (...[balanceBefore, balanceAfter, before, after]) => {
  const transaction: WalletTransaction = { id: 'tx', type: 'payment_debit', amount: '555555', balanceBefore, balanceAfter, status: 'completed', referenceId: null, description: null, createdAt: '2026-11-20T14:30:00Z' };
  render(<TransactionDetailModal transaction={transaction} onClose={jest.fn()} />);
  expect(screen.getByTestId('transaction-balance-before')).toHaveTextContent(`Số dư trước giao dịch: ${before}`);
  expect(screen.getByTestId('transaction-balance-after')).toHaveTextContent(`Số dư sau giao dịch: ${after}`);
});
