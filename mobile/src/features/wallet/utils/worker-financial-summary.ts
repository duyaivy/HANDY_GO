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
  let commissionDebited = 0n;
  for (const item of entries) {
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
  return {
    weeklyEarnings: paid.filter(item => inWeek(item.paidAt)).reduce((sum, item) => sum + BigInt(item.workerEarning), 0n).toString(),
    completedJobs: new Set(owned.filter(item => inWeek(item.orderCompletedAt)).map(item => item.orderId)).size,
    commissionPaid: (commissionDebited + paid.filter(item => item.method === 'point').reduce((sum, item) => sum + BigInt(item.platformFee), 0n)).toString(),
    cashCommissionDue: cashCommissionDue.toString(),
  };
}
