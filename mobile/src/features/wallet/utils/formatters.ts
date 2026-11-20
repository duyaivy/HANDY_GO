import type { WalletTransactionType } from '../types/wallet.types';

type PointAmount = string | number | null | undefined;

function toPointsBigInt(points: PointAmount): bigint {
  if (points == null || points === '')
    return 0n;
  if (typeof points === 'number') {
    if (!Number.isSafeInteger(points))
      throw new RangeError('Point amount must be a safe integer');
    return BigInt(points);
  }
  if (!/^-?\d+$/.test(points))
    throw new TypeError('Point amount must be an integer string');
  return BigInt(points);
}

export function formatPointsToVND(points: PointAmount): string {
  const amount = toPointsBigInt(points);
  const digits = (amount < 0n ? -amount : amount).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0n ? '-' : ''}${grouped} đ`;
}

/** Only use when a Number is required; financial comparisons should prefer BigInt. */
export function parsePointsToNumber(points: PointAmount): number {
  const amount = toPointsBigInt(points);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Point amount exceeds the safe integer range');
  }
  return Number(amount);
}

const CREDIT_TYPES: ReadonlySet<WalletTransactionType> = new Set([
  'topup',
  'worker_earning',
  'refund_credit',
  'commission_credit',
  'adjustment_recovery',
]);
const DEBIT_TYPES: ReadonlySet<WalletTransactionType> = new Set([
  'payment_debit',
  'platform_fee',
  'refund_recovery',
  'withdrawal',
  'commission_debit',
  'adjustment_funding',
]);

/** admin_adjustment can be either direction, so pass its direction explicitly. */
export function getTransactionSign(
  type: WalletTransactionType,
  direction?: 'credit' | 'debit',
): '+' | '-' {
  if (direction)
    return direction === 'credit' ? '+' : '-';
  if (CREDIT_TYPES.has(type))
    return '+';
  if (DEBIT_TYPES.has(type))
    return '-';
  throw new Error(`Transaction direction is unavailable for ${type}`);
}
