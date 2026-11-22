import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { EVENT_PATTERNS } from '@app/common';
import { RefundsService } from './refunds.service.js';
import { PaymentQueryService } from '../payment-query/payment-query.service.js';
import type { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import type { AdminAuditService } from '../common/audit/admin-audit.service.js';
import type { WalletClient } from '../common/clients/wallet.client.js';
import type { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';

const paymentId = randomUUID();
const orderId = randomUUID();
const refundId = randomUUID();
const resolutionId = randomUUID();
const transferId = randomUUID();
const adminUserId = randomUUID();
const basePayment = {
  id: paymentId,
  orderId,
  customerUserId: randomUUID(),
  workerUserId: randomUUID(),
  amount: 500000n,
  method: 'cash' as const,
  status: 'succeeded',
  platformFee: 50000n,
  workerEarning: 450000n,
  paidAt: new Date(),
};

function fixture(
  walletResult: unknown,
  refundOverrides: Partial<Record<string, any>> = {},
) {
  const payment = { ...basePayment };
  const refundRow: Record<string, any> = {
    id: refundId,
    paymentId,
    amountVnd: 500000n,
    approvedAt: new Date(),
    approvedByUserId: adminUserId,
    status: 'needs_review',
    disputeResolutionId: resolutionId,
    failureReason: 'Awaiting funded Wallet refund confirmation',
    updatedAt: new Date(Date.now() - 60_000),
    createdAt: new Date(Date.now() - 60_000),
    reason: 'Dispute refund',
    idempotencyKey: `dispute:${resolutionId}`,
    requestedByUserId: null,
    rejectedByUserId: null,
    rejectedAt: null,
    decisionNote: 'Admin approved',
    refundedAt: null,
    walletTransferId: null,
    providerRefundId: null,
    payment,
    ...refundOverrides,
  };
  const refundsById = new Map<string, Record<string, any>>([[refundRow.id, refundRow]]);

  const tx = {
    $queryRaw: vi.fn(),
    payment: {
      findUnique: vi.fn(async () => payment),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(payment, data);
        return payment;
      }),
    },
    refund: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const found = refundsById.get(where.id);
        if (!found) throw new Error('Refund not found');
        return found;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const found = refundsById.get(where.id);
        if (!found) throw new Error('Refund not found');
        Object.assign(found, data);
        return found;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const found = refundsById.get(where.id);
        if (!found) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(found.status)) {
          return { count: 0 };
        }
        if (typeof where.status === 'string' && found.status !== where.status) {
          return { count: 0 };
        }
        Object.assign(found, data);
        return { count: 1 };
      }),
      aggregate: vi.fn(async ({ where }: any) => {
        const statuses: string[] = where.status?.in
          ? where.status.in
          : typeof where.status === 'string'
            ? [where.status]
            : [];
        const total = [...refundsById.values()]
          .filter(
            (r) =>
              r.paymentId === where.paymentId &&
              (statuses.length === 0 || statuses.includes(r.status)),
          )
          .reduce((acc, r) => acc + r.amountVnd, 0n);
        return { _sum: { amountVnd: total } };
      }),
    },
  };
  const db = {
    client: {
      payment: {
        findUnique: vi.fn(async () => payment),
      },
      refund: {
        findUnique: vi.fn(async ({ where }: any) => {
          for (const r of refundsById.values()) {
            if (
              (where.id && r.id === where.id) ||
              (where.disputeResolutionId &&
                r.disputeResolutionId === where.disputeResolutionId)
            ) {
              return { ...r, payment };
            }
          }
          return null;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: any) => {
          const found = refundsById.get(where.id);
          if (!found) throw new Error('Refund not found');
          return { ...found, payment };
        }),
        updateMany: vi.fn(async ({ where, data }: any) =>
          tx.refund.updateMany({ where, data }),
        ),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: tx.refund.aggregate,
      },
      $transaction: vi.fn(async (run: any) => run(tx)),
    },
  };
  const audit = { record: vi.fn() };
  const wallet = {
    getOperation: vi.fn().mockResolvedValue(walletResult),
    refundCredit: vi.fn(),
  };
  const outbox = { enqueue: vi.fn() };
  const service = new RefundsService(
    db as unknown as PaymentPrismaService,
    audit as unknown as AdminAuditService,
    wallet as unknown as WalletClient,
    outbox as unknown as PaymentOutboxService,
  );
  const queryService = new PaymentQueryService(
    db as unknown as PaymentPrismaService,
  );
  return {
    service,
    queryService,
    db,
    tx,
    wallet,
    outbox,
    audit,
    payment,
    refundRow,
    refundsById,
  };
}

describe('HG-82 refund outcome', () => {
  it('publishes the correlated completion only after the Wallet ledger confirms', async () => {
    const f = fixture(
      {
        outcome: 'ok',
        data: {
          operationId: `${paymentId}:refund:${refundId}`,
          kind: 'refund',
          status: 'completed',
          amount: '150000',
          transferId,
        },
      },
      { amountVnd: 150000n },
    );
    await f.service.execute(refundId);
    expect(f.refundRow.status).toBe('completed');
    expect(f.outbox.enqueue.mock.calls.map(([, event]) => event.eventType)).toEqual([
      EVENT_PATTERNS.PAYMENT_REFUNDED,
      EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
    ]);
    expect(f.outbox.enqueue).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({
        eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
        payload: expect.objectContaining({
          resolutionId,
          refundId,
          paymentStatus: 'partially_refunded',
        }),
      }),
    );
  });

  it('retains the pending refund and reservation when Wallet has no confirmed outcome', async () => {
    const f = fixture({ outcome: 'unknown' });
    await f.service.execute(refundId);
    expect(f.refundRow.status).toBe('needs_review');
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
    const preflight = await f.queryService.refundableByOrder(orderId);
    expect(preflight.refundableAmountVnd).toBe('0');
  });

  it('marks dispute refund terminal failed and releases reservation after verifying Wallet 422 rejected without ledger commit', async () => {
    const f = fixture({ outcome: 'missing' });
    f.wallet.refundCredit.mockResolvedValue({
      outcome: 'rejected',
      status: 422,
      message: 'Insufficient reserve',
    });

    // Before execution: full 500k is reserved
    expect((await f.queryService.refundableByOrder(orderId)).refundableAmountVnd).toBe('0');

    await f.service.execute(refundId);

    // Must verify getOperation twice: once before refundCredit, once after 422 rejection
    expect(f.wallet.getOperation).toHaveBeenCalledTimes(2);
    expect(f.refundRow.status).toBe('failed');
    expect(f.refundRow.failureReason).toBe('WALLET_REJECTED_422: Insufficient reserve');
    expect(f.outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(f.outbox.enqueue).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({
        aggregateType: 'payment',
        aggregateId: paymentId,
        eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
        payload: {
          resolutionId,
          orderId,
          paymentId,
          refundId,
          failureCode: 'WALLET_REJECTED_422',
        },
      }),
    );

    // Reservation is immediately released for Admin override (e.g. smaller 100k refund)
    const afterFailure = await f.queryService.refundableByOrder(orderId);
    expect(afterFailure.refundableAmountVnd).toBe('500000');

    // Subsequent execute does not retry terminal failed refund
    await f.service.execute(refundId);
    expect(f.wallet.refundCredit).toHaveBeenCalledTimes(1);
    expect(f.outbox.enqueue).toHaveBeenCalledTimes(1);

    // Now simulate Admin override creating a replacement 100k refund and completing it
    const replacementRefundId = randomUUID();
    const replacementResolutionId = randomUUID();
    f.refundsById.set(replacementRefundId, {
      ...f.refundRow,
      id: replacementRefundId,
      disputeResolutionId: replacementResolutionId,
      amountVnd: 100000n,
      status: 'needs_review',
      failureReason: 'Awaiting funded Wallet refund confirmation',
    });
    f.wallet.getOperation.mockResolvedValueOnce({
      outcome: 'ok',
      data: {
        operationId: `${paymentId}:refund:${replacementRefundId}`,
        kind: 'refund',
        status: 'completed',
        amount: '100000',
        transferId: randomUUID(),
      },
    });
    await f.service.execute(replacementRefundId);
    expect(f.refundsById.get(replacementRefundId)?.status).toBe('completed');
    expect(f.payment.status).toBe('partially_refunded');
    expect((await f.queryService.refundableByOrder(orderId)).refundableAmountVnd).toBe('400000');
  });

  it('keeps reservation held in needs_review when Wallet 422 verification getOperation returns unknown', async () => {
    const f = fixture({ outcome: 'missing' });
    f.wallet.getOperation
      .mockResolvedValueOnce({ outcome: 'missing' })
      .mockResolvedValueOnce({ outcome: 'unknown', message: 'Wallet timeout' });
    f.wallet.refundCredit.mockResolvedValue({
      outcome: 'rejected',
      status: 422,
      message: 'Conflict',
    });

    await f.service.execute(refundId);

    expect(f.refundRow.status).toBe('needs_review');
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
    expect((await f.queryService.refundableByOrder(orderId)).refundableAmountVnd).toBe('0');
  });

  it('completes the refund if Wallet 4xx verification getOperation reveals a committed transfer', async () => {
    const f = fixture({ outcome: 'missing' }, { amountVnd: 150000n });
    f.wallet.getOperation
      .mockResolvedValueOnce({ outcome: 'missing' })
      .mockResolvedValueOnce({
        outcome: 'ok',
        data: {
          operationId: `${paymentId}:refund:${refundId}`,
          kind: 'refund',
          status: 'completed',
          amount: '150000',
          transferId,
        },
      });
    f.wallet.refundCredit.mockResolvedValue({
      outcome: 'rejected',
      status: 409,
      message: 'Already processed',
    });

    await f.service.execute(refundId);

    expect(f.refundRow.status).toBe('completed');
    expect(f.outbox.enqueue).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({
        eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
      }),
    );
  });

  it('does not emit needs_review when Wallet refundCredit returns unknown (timeout/5xx)', async () => {
    const f = fixture({ outcome: 'missing' });
    f.wallet.refundCredit.mockResolvedValue({
      outcome: 'unknown',
      message: 'timeout',
    });

    await f.service.execute(refundId);

    expect(f.refundRow.status).toBe('needs_review');
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
  });

  describe('cancelDisputeRefundForOverride & late completion safety', () => {
    it('cancels a needs_review refund and releases reservation after confirming Wallet has no operation', async () => {
      const f = fixture({ outcome: 'missing' });
      const res = await f.service.cancelDisputeRefundForOverride(resolutionId, {
        orderId,
        adminUserId,
        reason: 'Override to smaller refund',
      });

      expect(res).toMatchObject({
        safeToOverride: true,
        outcome: 'cancelled',
        refundId,
        refundStatus: 'cancelled',
      });
      expect(f.refundRow.status).toBe('cancelled');
      expect((await f.queryService.refundableByOrder(orderId)).refundableAmountVnd).toBe('500000');
      expect(f.audit.record).toHaveBeenCalledWith(
        f.tx,
        expect.objectContaining({
          action: 'dispute.refund.cancelled_for_override',
        }),
      );
    });

    it('blocks override and immediately reconciles when Wallet already committed the old refund', async () => {
      const f = fixture(
        {
          outcome: 'ok',
          data: {
            operationId: `${paymentId}:refund:${refundId}`,
            kind: 'refund',
            status: 'completed',
            amount: '200000',
            transferId,
          },
        },
        { amountVnd: 200000n },
      );

      const res = await f.service.cancelDisputeRefundForOverride(resolutionId, {
        orderId,
        adminUserId,
        reason: 'Try to override',
      });

      expect(res).toMatchObject({
        safeToOverride: false,
        outcome: 'already_completed',
        refundId,
        refundStatus: 'completed',
        paymentStatus: 'partially_refunded',
      });
      expect(f.refundRow.status).toBe('completed');
      expect(f.outbox.enqueue).toHaveBeenCalledWith(
        f.tx,
        expect.objectContaining({
          eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
        }),
      );
    });

    it('blocks override while refund execution is actively processing or Wallet status is uncertain', async () => {
      const inFlight = fixture(
        { outcome: 'missing' },
        { status: 'processing', updatedAt: new Date() },
      );
      const resProcessing = await inFlight.service.cancelDisputeRefundForOverride(
        resolutionId,
        { orderId, adminUserId, reason: 'Try override during processing' },
      );
      expect(resProcessing).toMatchObject({
        safeToOverride: false,
        outcome: 'refund_in_progress',
      });
      expect(inFlight.wallet.getOperation).not.toHaveBeenCalled();

      const uncertain = fixture({ outcome: 'unknown', message: 'timeout' });
      const resUncertain = await uncertain.service.cancelDisputeRefundForOverride(
        resolutionId,
        { orderId, adminUserId, reason: 'Try override while wallet down' },
      );
      expect(resUncertain).toMatchObject({
        safeToOverride: false,
        outcome: 'wallet_uncertain',
      });
      expect(uncertain.refundRow.status).toBe('needs_review');
    });

    it('reconciles a late Wallet completion even if the refund was cancelled concurrently during execute', async () => {
      const f = fixture({ outcome: 'missing' }, { amountVnd: 200000n });
      f.wallet.refundCredit.mockImplementationOnce(async () => {
        // Simulate concurrent override cancelling the refund while refundCredit was in flight
        f.refundRow.status = 'cancelled';
        return { outcome: 'ok', status: 200, data: {} };
      });
      f.wallet.getOperation
        .mockResolvedValueOnce({ outcome: 'missing' })
        .mockResolvedValueOnce({
          outcome: 'ok',
          data: {
            operationId: `${paymentId}:refund:${refundId}`,
            kind: 'refund',
            status: 'completed',
            amount: '200000',
            transferId,
          },
        });

      await f.service.execute(refundId);

      expect(f.refundRow.status).toBe('completed');
      expect(f.refundRow.failureReason).toBe('LATE_WALLET_COMPLETION_AFTER_CANCEL');
      expect(f.payment.status).toBe('partially_refunded');
      expect(f.outbox.enqueue).toHaveBeenCalledWith(
        f.tx,
        expect.objectContaining({
          eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_COMPLETED,
          payload: expect.objectContaining({
            resolutionId,
            refundId,
            refundAmountVnd: '200000',
            paymentStatus: 'partially_refunded',
          }),
        }),
      );
      expect(f.audit.record).toHaveBeenCalledWith(
        f.tx,
        expect.objectContaining({
          action: 'refund.completed_late_after_cancel',
        }),
      );
    });
  });
});
