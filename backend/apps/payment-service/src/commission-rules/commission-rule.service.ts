import { Injectable } from '@nestjs/common';
import { RetryableInboundError } from '../common/inbound/inbound-event.js';
import type { PaymentTx } from '../common/outbox/payment-events.js';
import { calculateAllocation } from '../common/money/payment-money.js';

export interface CommissionSnapshot {
  commissionRuleId: string;
  commissionRatePercent: string;
  platformFee: bigint;
  workerEarning: bigint;
}

// Raised when no versioned rule is effective: callers must fail closed and never fall back to 0%.
export class CommissionRuleMissingError extends RetryableInboundError {
  constructor() {
    super('No active commission rule is effective for the requested time');
  }
}

@Injectable()
export class CommissionRuleService {
  async snapshotFor(tx: PaymentTx, amount: bigint, at: Date): Promise<CommissionSnapshot> {
    const rule = await tx.commissionRule.findFirst({
      where: {
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!rule) throw new CommissionRuleMissingError();
    const ratePercent = rule.ratePercent.toFixed(2);
    const { platformFee, workerEarning } = calculateAllocation(amount, ratePercent);
    return { commissionRuleId: rule.id, commissionRatePercent: ratePercent, platformFee, workerEarning };
  }
}
