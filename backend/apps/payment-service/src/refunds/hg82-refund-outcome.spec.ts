import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { EVENT_PATTERNS } from '@app/common';
import { RefundsService } from './refunds.service.js';
import type { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import type { AdminAuditService } from '../common/audit/admin-audit.service.js';
import type { WalletClient } from '../common/clients/wallet.client.js';
import type { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';

const paymentId = randomUUID();
const refundId = randomUUID();
const resolutionId = randomUUID();
const transferId = randomUUID();
const payment = { id: paymentId, orderId: randomUUID(), customerUserId: randomUUID(),
  workerUserId: randomUUID(), amount: 350000n, method: 'cash', status: 'succeeded',
  platformFee: 35000n, workerEarning: 315000n, paidAt: new Date() };
const refund = { id: refundId, paymentId, amountVnd: 150000n, approvedAt: new Date(),
  approvedByUserId: randomUUID(), status: 'needs_review', disputeResolutionId: resolutionId, payment };

function fixture(walletResult: unknown) {
  const tx = {
    $queryRaw: vi.fn(),
    payment: { findUnique: vi.fn().mockResolvedValue(payment), update: vi.fn().mockResolvedValue({ ...payment, status: 'partially_refunded' }) },
    refund: { findUniqueOrThrow: vi.fn().mockResolvedValue(refund), update: vi.fn().mockResolvedValue(refund),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountVnd: 150000n } }) },
  };
  const db = { client: {
    refund: { findUniqueOrThrow: vi.fn().mockResolvedValue(refund), updateMany: vi.fn() },
    $transaction: vi.fn(async (run: any) => run(tx)),
  } };
  const audit = { record: vi.fn() };
  const wallet = { getOperation: vi.fn().mockResolvedValue(walletResult), refundCredit: vi.fn() };
  const outbox = { enqueue: vi.fn() };
  const service = new RefundsService(db as unknown as PaymentPrismaService,
    audit as unknown as AdminAuditService, wallet as unknown as WalletClient,
    outbox as unknown as PaymentOutboxService);
  return { service, db, tx, wallet, outbox };
}

describe('HG-82 refund outcome', () => {
  it('publishes the correlated completion only after the Wallet ledger confirms', async () => {
    const f = fixture({ outcome: 'ok', data: { operationId: `${paymentId}:refund:${refundId}`,
      kind: 'refund', status: 'completed', amount: '150000', transferId } });
    await f.service.execute(refundId);
    expect(f.tx.refund.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }));
    expect(f.outbox.enqueue.mock.calls.map(([, event]) => event.eventType)).toEqual([
      EVENT_PATTERNS.PAYMENT_REFUNDED, EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
    ]);
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
      payload: expect.objectContaining({ resolutionId, refundId, paymentStatus: 'partially_refunded' }),
    }));
  });

  it('retains the pending refund when Wallet has no confirmed outcome', async () => {
    const f = fixture({ outcome: 'unknown' });
    await f.service.execute(refundId);
    expect(f.tx.refund.update).not.toHaveBeenCalled();
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
  });
});
