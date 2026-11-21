import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DisputeRefundService } from './dispute-refund.service.js';
import type { PaymentInboxService } from '../common/inbound/payment-inbox.service.js';
import type { PaymentPrismaService } from '../common/database/payment-prisma.service.js';
import type { PaymentOutboxService } from '../common/outbox/payment-outbox.service.js';
import type { AdminAuditService } from '../common/audit/admin-audit.service.js';
import type { RefundsService } from '../refunds/refunds.service.js';
import { EVENT_PATTERNS } from '@app/common';

const orderId = randomUUID();
const paymentId = randomUUID();
const resolutionId = randomUUID();
const customerUserId = randomUUID();
const workerUserId = randomUUID();
const adminUserId = randomUUID();

function fixture() {
  const payment = { id: paymentId, orderId, customerUserId, workerUserId, status: 'succeeded', amount: 350000n };
  const tx = {
    $queryRaw: vi.fn(),
    payment: { findUnique: vi.fn().mockResolvedValue(payment) },
    refund: {
      findUnique: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountVnd: 0n } }),
      create: vi.fn(async ({ data }: any) => ({ id: randomUUID(), ...data })),
    },
  };
  const inbox = { register: vi.fn() };
  const outbox = { enqueue: vi.fn() };
  const audit = { record: vi.fn() };
  const refunds = { execute: vi.fn() };
  const service = new DisputeRefundService(inbox as unknown as PaymentInboxService,
    {} as PaymentPrismaService, outbox as unknown as PaymentOutboxService,
    audit as unknown as AdminAuditService, refunds as unknown as RefundsService);
  const data = { action: 'refund', resolutionId, orderId, paymentId, customerUserId, workerUserId, adminUserId,
    refundAmountVnd: '200000', resolutionNote: 'Hoàn tiền theo phán quyết Admin' };
  return { service, tx, inbox, outbox, audit, refunds, data };
}

describe('Payment HG-82 dispute refund consumer', () => {
  it('registers the decision contract and reserves an approved refund with separate actors', async () => {
    const f = fixture();
    f.service.onModuleInit();
    expect(f.inbox.register).toHaveBeenCalledWith(EVENT_PATTERNS.ORDER_DISPUTE_DECISION_RECORDED, expect.any(Function));
    await f.service.recordDecision(f.data, f.tx as any);
    expect(f.tx.refund.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      disputeResolutionId: resolutionId, requestedByUserId: null, approvedByUserId: adminUserId,
      amountVnd: 200000n, status: 'needs_review',
    }) });
    expect(f.audit.record).toHaveBeenCalledWith(f.tx, expect.objectContaining({ actorUserId: adminUserId }));
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('does not reserve above paid balance including existing refund reservations', async () => {
    const f = fixture();
    f.tx.refund.aggregate.mockResolvedValue({ _sum: { amountVnd: 200000n } });
    await f.service.recordDecision(f.data, f.tx as any);
    expect(f.tx.refund.create).not.toHaveBeenCalled();
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
      payload: expect.objectContaining({ failureCode: 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE' }),
    }));
  });

  it('keeps the existing no self-approval rule', async () => {
    const f = fixture();
    await f.service.recordDecision({ ...f.data, adminUserId: customerUserId }, f.tx as any);
    expect(f.tx.refund.create).not.toHaveBeenCalled();
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      payload: expect.objectContaining({ failureCode: 'APPROVER_IS_CUSTOMER' }),
    }));
  });

  it('does not create another refund for a replay of the same resolution', async () => {
    const f = fixture();
    f.tx.refund.findUnique.mockResolvedValue({ paymentId, amountVnd: 200000n });
    await f.service.recordDecision(f.data, f.tx as any);
    expect(f.tx.refund.create).not.toHaveBeenCalled();
    expect(f.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('flags a Payment that became non-refundable after the Admin decision', async () => {
    const f = fixture();
    f.tx.payment.findUnique.mockResolvedValue({
      id: paymentId, orderId, customerUserId, workerUserId, status: 'failed', amount: 350000n,
    });
    await f.service.recordDecision(f.data, f.tx as any);
    expect(f.tx.refund.create).not.toHaveBeenCalled();
    expect(f.outbox.enqueue).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
      payload: expect.objectContaining({ failureCode: 'PAYMENT_NOT_REFUNDABLE' }),
    }));
  });
});
