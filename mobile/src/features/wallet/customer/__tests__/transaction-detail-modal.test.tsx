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
