import type { WalletTransaction, WalletTransactionStatus, WalletTransactionType } from '../types/wallet.types';
import { formatPointsToVND, getTransactionSign } from './formatters';

const LABELS: Record<WalletTransactionType, string> = {
  topup: 'Nạp tiền vào ví',
  payment_debit: 'Thanh toán đơn việc',
  refund_credit: 'Hoàn tiền dịch vụ',
  refund_recovery: 'Thu hồi hoàn tiền',
  worker_earning: 'Thu nhập đơn việc',
  platform_fee: 'Phí nền tảng',
  withdrawal: 'Rút tiền',
  commission_debit: 'Phí nền tảng',
  commission_credit: 'Thu phí nền tảng',
  adjustment_funding: 'Điều chỉnh nguồn tiền',
  adjustment_recovery: 'Thu hồi điều chỉnh',
  admin_adjustment: 'Điều chỉnh số dư',
};
export const TRANSACTION_STATUSES: Record<WalletTransactionStatus, string> = {
  pending: 'Đang xử lý',
  completed: 'Thành công',
  reversed: 'Đã đảo giao dịch',
  failed: 'Thất bại',
};
export function transactionTitle(transaction: WalletTransaction): string {
  const label = LABELS[transaction.type] ?? 'Giao dịch ví';
  return transaction.type === 'payment_debit' && transaction.referenceId ? `${label} #${transaction.referenceId}` : label;
}
export function transactionAmount(transaction: WalletTransaction): string {
  // The API omits direction for admin adjustments. Do not invent a sign.
  try {
    return `${getTransactionSign(transaction.type)}${formatPointsToVND(transaction.amount)}`;
  }
  catch {
    return formatPointsToVND(transaction.amount);
  }
}
export function transactionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return 'Chưa có thời gian';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())} - ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
