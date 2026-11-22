import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from './orders.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import type { PaymentRefundClient } from './payment-refund.client.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';

const orderId = randomUUID();
const adminUserId = randomUUID();
const customerUserId = randomUUID();
const workerUserId = randomUUID();
const disputedAt = new Date('2026-11-21T00:00:00Z');
const completedAt = new Date('2026-11-20T00:00:00Z');
const paymentId = randomUUID();

function fixture() {
  let order: Record<string, any> = {
    id: orderId, orderCode: 'ORD-HG82', status: 'disputed', disputePreviousStatus: 'completed',
    disputedAt, completedAt, firstCompletedAt: completedAt, workerFinishedAt: completedAt,
    customerUserId, workerUserId, version: 3, agreedPrice: { toString: () => '350000' },
  };
  let resolutions: Record<string, any>[] = [];
  const outbox = { createEvent: vi.fn().mockResolvedValue(undefined) };
  const tx = {
    $queryRaw: vi.fn(),
    order: {
      findUnique: vi.fn(async () => order), findUniqueOrThrow: vi.fn(async () => order),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (where.status !== order.status || where.version !== order.version) return { count: 0 };
        order = { ...order, ...data, version: order.version + 1 };
        return { count: 1 };
      }),
    },
    orderDisputeResolution: {
      findUnique: vi.fn(async ({ where }: any) =>
        resolutions.find((r) =>
          (where.id && r.id === where.id) ||
          (where.idempotencyKey && r.idempotencyKey === where.idempotencyKey) ||
          (where.orderId_disputedAt &&
            r.orderId === where.orderId_disputedAt.orderId &&
            r.disputedAt?.getTime() === where.orderId_disputedAt.disputedAt?.getTime()),
        ) ?? null,
      ),
      findFirst: vi.fn(async ({ where }: any) =>
        resolutions.find((r) =>
          r.orderId === where.orderId &&
          r.disputedAt?.getTime() === where.disputedAt?.getTime() &&
          (where.state?.not ? r.state !== where.state.not : true),
        ) ?? null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const target = resolutions.find((r) => r.id === where.id);
        if (!target) throw new Error('Resolution not found');
        Object.assign(target, data);
        return target;
      }),
      create: vi.fn(async ({ data }: any) => {
        const created = { id: randomUUID(), decidedAt: new Date(), ...data };
        resolutions.push(created);
        return created;
      }),
    },
    orderStatusHistory: { create: vi.fn() },
  };
  const db = {
    order: {
      findUnique: vi.fn(async () => order),
      findUniqueOrThrow: vi.fn(async () => order),
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{ ...order, evidences: [] }]),
    },
    orderDisputeResolution: {
      findUnique: vi.fn(async ({ where }: any) =>
        resolutions.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null,
      ),
      findMany: vi.fn(async ({ where }: any) =>
        resolutions.filter((r) =>
          where?.state?.not ? r.state !== where.state.not : true,
        ),
      ),
    },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  };
  const payment = { byOrder: vi.fn().mockResolvedValue({ paymentId, status: 'succeeded', refundableAmountVnd: 300000n }) };
  const service = new OrdersService(db as unknown as PrismaService, outbox as unknown as OrderOutboxRepository, payment as unknown as PaymentRefundClient);
  return { service, db, tx, outbox, payment, get order() { return order; }, get resolutions() { return resolutions; } };
}

describe('HG-82 Admin resolution', () => {
  it('records a refund decision once and leaves the order disputed until Payment confirms', async () => {
    const f = fixture();
    const dto = { action: 'refund' as const, resolutionNote: 'Hoàn một phần theo bằng chứng', refundAmountVnd: '200000', idempotencyKey: randomUUID() };
    const first = await f.service.resolveCompletedDispute(orderId, adminUserId, dto, ['Admin']);
    expect(first.state).toBe('refund_pending');
    expect(first.status).toBe('disputed');
    expect(first.refundAmountVnd).toBe('200000');
    expect(f.tx.orderDisputeResolution.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ refundAmountVnd: 200000n, paymentId }) }));
    expect(f.outbox.createEvent).toHaveBeenCalledTimes(1);
    expect(f.outbox.createEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_DECISION_RECORDED }), f.tx);
    const replay = await f.service.resolveCompletedDispute(orderId, adminUserId, dto, ['Admin']);
    expect(replay.resolutionId).toBe(first.resolutionId);
    expect(f.tx.orderDisputeResolution.create).toHaveBeenCalledTimes(1);
    await expect(f.service.resolveCompletedDispute(orderId, adminUserId, { ...dto, resolutionNote: 'Khác nội dung quyết định' }, ['Admin']))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DISPUTE_ALREADY_DECIDED' }) });
  });

  it('rejects an unpaid Payment before recording a decision', async () => {
    const f = fixture();
    f.payment.byOrder.mockResolvedValue({ paymentId, status: 'pending', refundableAmountVnd: 300000n });
    await expect(f.service.resolveCompletedDispute(orderId, adminUserId,
      { action: 'refund', resolutionNote: 'Khách chưa trả tiền', idempotencyKey: randomUUID() }, ['Admin']))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PAYMENT_NOT_REFUNDABLE' }) });
    expect(f.tx.orderDisputeResolution.create).not.toHaveBeenCalled();
  });

  it('defaults the refund to the exact remaining paid balance', async () => {
    const f = fixture();
    const result = await f.service.resolveCompletedDispute(orderId, adminUserId,
      { action: 'refund', resolutionNote: 'Hoàn toàn bộ số dư còn lại', idempotencyKey: randomUUID() }, ['Admin']);
    expect(result.refundAmountVnd).toBe('300000');
    expect(f.tx.orderDisputeResolution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ refundAmountVnd: 300000n }),
    }));
  });

  it('rejects a refund above the remaining balance without a decision or event', async () => {
    const f = fixture();
    await expect(f.service.resolveCompletedDispute(orderId, adminUserId,
      { action: 'refund', resolutionNote: 'Vượt quá hạn mức hoàn', refundAmountVnd: '300001', idempotencyKey: randomUUID() }, ['Admin']))
      .rejects.toMatchObject({ status: 400, response: expect.objectContaining({ code: 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE' }) });
    expect(f.tx.orderDisputeResolution.create).not.toHaveBeenCalled();
    expect(f.outbox.createEvent).not.toHaveBeenCalled();
  });

  it('rejects a second key for the same dispute cycle', async () => {
    const f = fixture();
    const dto = { action: 'refund' as const, resolutionNote: 'Hoàn một phần theo bằng chứng', refundAmountVnd: '200000' };
    await f.service.resolveCompletedDispute(orderId, adminUserId, { ...dto, idempotencyKey: randomUUID() }, ['Admin']);
    await expect(f.service.resolveCompletedDispute(orderId, adminUserId, { ...dto, idempotencyKey: randomUUID() }, ['Admin']))
      .rejects.toMatchObject({ status: 409, response: expect.objectContaining({ code: 'DISPUTE_ALREADY_DECIDED' }) });
    expect(f.tx.orderDisputeResolution.create).toHaveBeenCalledTimes(1);
    expect(f.outbox.createEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects legacy actions after completion and non-admin decisions', async () => {
    const f = fixture();
    await expect(f.service.resolveDispute(orderId, adminUserId,
      { action: 'complete', resolutionNote: 'Hoàn tất theo cách cũ' }, ['Admin']))
      .rejects.toMatchObject({ status: 400, response: expect.objectContaining({ code: 'LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION' }) });
    await expect(f.service.resolveCompletedDispute(orderId, adminUserId,
      { action: 'dismiss', resolutionNote: 'Không chấp nhận khiếu nại', idempotencyKey: randomUUID() }, ['Worker']))
      .rejects.toMatchObject({ status: 403, response: expect.objectContaining({ code: 'FORBIDDEN_ROLE' }) });
    expect(f.tx.orderDisputeResolution.create).not.toHaveBeenCalled();
  });

  it('rejects Admin self-approval before creating a pending refund decision', async () => {
    const f = fixture();
    await expect(f.service.resolveCompletedDispute(orderId, customerUserId,
      { action: 'refund', resolutionNote: 'Hoàn tiền cho đơn của mình', idempotencyKey: randomUUID() }, ['Admin']))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'REFUND_SELF_APPROVAL_FORBIDDEN' }) });
    expect(f.payment.byOrder).not.toHaveBeenCalled();
    expect(f.tx.orderDisputeResolution.create).not.toHaveBeenCalled();
  });

  it('dismisses without changing the completion timestamp or reopening Payment', async () => {
    const f = fixture();
    const result = await f.service.resolveCompletedDispute(orderId, adminUserId,
      { action: 'dismiss', resolutionNote: 'Bằng chứng không đủ cơ sở', idempotencyKey: randomUUID() }, ['Admin']);
    expect(result.status).toBe('completed');
    expect(f.order.completedAt).toEqual(completedAt);
    expect(f.outbox.createEvent.mock.calls.map(([event]) => event.eventType)).toEqual([
      ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_DECISION_RECORDED,
      ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
      ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_RESOLVED,
    ]);
  });

  it('rework preserves the first completion and clears only the active cycle', async () => {
    const f = fixture();
    const result = await f.service.resolveCompletedDispute(orderId, adminUserId,
      { action: 'rework', resolutionNote: 'Thợ cần thực hiện bảo hành', idempotencyKey: randomUUID() }, ['Admin']);
    expect(result.status).toBe('in_progress');
    expect(f.order.firstCompletedAt).toEqual(completedAt);
    expect(f.order.completedAt).toBeNull();
    expect(f.order.workerFinishedAt).toBeNull();
  });

  it.each(['dismiss', 'rework', 'refund'] as const)(
    'allows superseding a needs_review resolution with a new %s decision and hides the superseded row in adminFindDisputes',
    async (replacementAction) => {
      const f = fixture();
      const first = await f.service.resolveCompletedDispute(
        orderId,
        adminUserId,
        {
          action: 'refund',
          resolutionNote: 'Hoàn 200k lần đầu bị kẹt',
          refundAmountVnd: '200000',
          idempotencyKey: randomUUID(),
        },
        ['Admin'],
      );
      f.resolutions[0].state = 'needs_review';
      f.resolutions[0].failureCode = 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE';
      f.payment.byOrder.mockResolvedValue({
        paymentId,
        status: 'partially_refunded',
        refundableAmountVnd: 100000n,
      });

      const second = await f.service.resolveCompletedDispute(
        orderId,
        adminUserId,
        {
          action: replacementAction,
          resolutionNote: 'Phán quyết thay thế sau khi rà soát',
          ...(replacementAction === 'refund' ? { refundAmountVnd: '100000' } : {}),
          idempotencyKey: randomUUID(),
        },
        ['Admin'],
      );

      expect(f.resolutions[0].state).toBe('superseded');
      expect(second.resolutionId).not.toBe(first.resolutionId);
      expect(second.state).toBe(
        replacementAction === 'refund' ? 'refund_pending' : 'completed',
      );

      const queue = await f.service.adminFindDisputes({} as any, ['Admin']);
      expect(queue.items[0].resolution?.resolutionId).toBe(second.resolutionId);
      expect(queue.items[0].resolution?.state).toBe(second.state);
    },
  );
});
