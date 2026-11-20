import type { WalletTransaction } from '../../types/wallet.types';
import { workerPayment } from '../../worker/__tests__/fixtures';
import { workerFinancialSummary } from '../worker-financial-summary';

const now = new Date('2026-11-20T18:00:00Z');
const paid = { ...workerPayment, status: 'succeeded' as const, paidAt: '2026-11-20T10:00:00Z' };
const commission: WalletTransaction = { id: 'tx-1', type: 'commission_debit', amount: '30000', status: 'completed', referenceId: paid.id, description: null, createdAt: '2026-11-20T10:00:00Z' };
it('uses server allocations, reconciles collected cash commission by payment ID, and deduplicates records', () => {
  const point = { ...paid, id: 'point-1', orderId: 'order-2', method: 'point' as const };
  const summary = workerFinancialSummary([paid, point, paid], [commission, commission], { userId: 'worker-1', now });
  expect(summary).toEqual({ weeklyEarnings: '300000', completedJobs: 2, commissionPaid: '80000', cashCommissionDue: '20000' });
});
it('excludes other workers, unpaid income and old weeks while preserving large amounts', () => {
  const summary = workerFinancialSummary([
    { ...paid, id: 'other', workerUserId: 'other-worker' },
    { ...paid, id: 'old', orderId: 'old-order', paidAt: '2025-01-01', orderCompletedAt: '2025-01-01' },
    workerPayment,
  ], [], { userId: 'worker-1', now });
  expect(summary.weeklyEarnings).toBe('0');
  expect(summary.completedJobs).toBe(1);
  const large = workerFinancialSummary([{ ...paid, workerEarning: '9007199254740993' }], [], { userId: 'worker-1', now });
  expect(large.weeklyEarnings).toBe('9007199254740993');
});
