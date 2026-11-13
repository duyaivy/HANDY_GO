import { describe, expect, it, vi } from 'vitest';
import type { PaymentTx } from '../common/outbox/payment-events.js';
import { CommissionRuleMissingError, CommissionRuleService } from './commission-rule.service.js';

function tx(rule: unknown) {
  const findFirst = vi.fn().mockResolvedValue(rule);
  return { tx: { commissionRule: { findFirst } } as unknown as PaymentTx, findFirst };
}

describe('CommissionRuleService', () => {
  it('snapshots the effective rule with exact half-up allocation', async () => {
    const { tx: db, findFirst } = tx({ id: 'rule-1', ratePercent: { toFixed: () => '12.50' } });
    const at = new Date('2026-11-05T00:00:00Z');
    await expect(new CommissionRuleService().snapshotFor(db, 10001n, at)).resolves.toEqual({
      commissionRuleId: 'rule-1',
      commissionRatePercent: '12.50',
      platformFee: 1250n,
      workerEarning: 8751n,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true, effectiveFrom: { lte: at } }) }),
    );
  });

  it('fails closed with a retryable error when no rule is effective', async () => {
    const { tx: db } = tx(null);
    await expect(new CommissionRuleService().snapshotFor(db, 100n, new Date())).rejects.toBeInstanceOf(CommissionRuleMissingError);
  });
});
