import type { OrderPaymentRecord } from '../types/payment.types';
import type { WalletTransaction } from '../types/wallet.types';

export function workerFinancialSummary(payments: OrderPaymentRecord[], ledger: WalletTransaction[], { userId, now = new Date() }: { userId: string; now?: Date }) {
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + 6) % 7);
  const inWeek = (value: string | null) => value != null && new Date(value).getTime() >= weekStart.getTime() && new Date(value).getTime() <= now.getTime();
  const owned = Array.from(new Map(payments.filter(item => item.workerUserId === userId).map(item => [item.id, item])).values());
  const entries = Array.from(new Map(ledger.map(item => [item.id, item])).values()).filter(item => item.status === 'completed');
  const paid = owned.filter(item => item.paidAt && ['succeeded', 'refunded', 'partially_refunded'].includes(item.status));
  const cashCollections = new Map<string, bigint>();
  const refundRecoveries = new Map<string, bigint>();
  let commissionDebited = 0n;
  for (const item of entries) {
    if (item.type === 'refund_recovery' && item.referenceId)
      refundRecoveries.set(item.referenceId, (refundRecoveries.get(item.referenceId) ?? 0n) + BigInt(item.amount));
    if (item.type !== 'commission_debit')
      continue;
    commissionDebited += BigInt(item.amount);
    if (item.referenceId)
      cashCollections.set(item.referenceId, (cashCollections.get(item.referenceId) ?? 0n) + BigInt(item.amount));
  }
  const cashCommissionDue = paid.filter(item => item.method === 'cash').reduce((sum, item) => {
    const remaining = BigInt(item.platformFee) - (cashCollections.get(item.id) ?? 0n);
    return sum + (remaining > 0n ? remaining : 0n);
  }, 0n);
  const workerRecovery = (item: OrderPaymentRecord) => {
    if (item.method !== 'point')
      return 0n;
    const recovered = refundRecoveries.get(item.id) ?? 0n;
    const refunded = BigInt(item.refundedAmount);
    const amount = BigInt(item.amount);
    const earning = BigInt(item.workerEarning);
    const fee = BigInt(item.platformFee);
    const expected = (refunded * earning) / amount;
    // Payment can report a completed refund before Wallet's ledger query catches up.
    if (refunded > amount || recovered > refunded || recovered > earning || refunded - recovered > fee || recovered < expected || recovered > expected + 1n)
      throw new Error('Dữ liệu hoàn tiền chưa đồng bộ. Vui lòng thử lại.');
    return recovered;
  };
  const pointCommission = paid.filter(item => item.method === 'point').reduce((sum, item) => {
    const feeRecovered = BigInt(item.refundedAmount) - workerRecovery(item);
    return sum + BigInt(item.platformFee) - feeRecovered;
  }, 0n);
  return {
    weeklyEarnings: paid.filter(item => inWeek(item.paidAt)).reduce((sum, item) => sum + BigInt(item.workerEarning) - workerRecovery(item), 0n).toString(),
    completedJobs: new Set(owned.filter(item => inWeek(item.orderCompletedAt)).map(item => item.orderId)).size,
    commissionPaid: (commissionDebited + pointCommission).toString(),
    cashCommissionDue: cashCommissionDue.toString(),
  };
}
