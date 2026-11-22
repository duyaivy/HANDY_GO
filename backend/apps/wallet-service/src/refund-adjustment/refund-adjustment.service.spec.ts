import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  REFUND_CANCELLED_FAILURE_CODE,
  RefundAdjustmentService,
} from './refund-adjustment.service.js';
describe('RefundAdjustmentService', () => {
  it('keeps new Cash refunds in review in production without posting a transfer', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const tx = { $queryRaw: vi.fn(), walletTransfer: { findUnique: vi.fn().mockResolvedValue(null) } };
      const prisma = {
        $transaction: vi.fn(async (arg: unknown) => typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[])),
        outboxEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
        walletAuditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      const posting = vi.fn();
      const service = new RefundAdjustmentService({ prisma, createBalancedTransferInTx: posting } as never);
      await expect(service.refund('u1', { paymentId: 'p1', refundId: 'r1', amount: '10', method: 'cash', grossAmount: '10' })).rejects.toMatchObject({ status: 409 });
      expect(posting).not.toHaveBeenCalled();
      expect(prisma.walletAuditLog.create).toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it('rejects a refund with no original payment', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      walletTransfer: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const ledger = { prisma: { $transaction: vi.fn(async (fn) => fn(tx)) } };
    const service = new RefundAdjustmentService(ledger as never);
    await expect(service.refund('u1', { paymentId: 'p1', refundId: 'r1', amount: '10' })).rejects.toMatchObject({ status: 404 });
  });

  it('refund thiếu nguồn → 409, ghi needs_review (audit + outbox), không tạo posting', async () => {
    const tx = {
      walletTransfer: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({ id: 'orig' }),
      },
      $queryRaw: vi.fn(),
      walletTransaction: { findMany: vi.fn().mockResolvedValue([{ direction: 'debit', walletId: 'w', amount: 10n }]) },
    };
    const prisma = {
      $transaction: vi.fn(async (arg: unknown) => (typeof arg === 'function' ? arg(tx) : Promise.all(arg as unknown[]))),
      outboxEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      walletAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new RefundAdjustmentService({ prisma } as never);
    await expect(service.refund('u1', { paymentId: 'p1', refundId: 'r1', amount: '10' })).rejects.toMatchObject({ status: 409 });
    expect(prisma.walletAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'wallet.refund.needs_review', targetUserId: 'u1' }) }),
    );
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: 'wallet.refund.needs_review' }) }),
    );
  });

  it('cancelRefundOperation writes a durable failed tombstone under advisory lock and replays idempotently', async () => {
    const paymentId = randomUUID();
    const refundId = randomUUID();
    const customerUserId = randomUUID();
    const actorUserId = randomUUID();
    const tombstoneId = randomUUID();
    const operationId = `${paymentId}:refund:${refundId}`;
    const idempotencyKey = `refund:${refundId}`;
    let stored: Record<string, unknown> | null = null;
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      walletTransfer: {
        findUnique: vi.fn(async () => stored),
        create: vi.fn(async ({ data }: any) => {
          stored = { id: tombstoneId, ...data };
          return stored;
        }),
      },
      walletAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    const service = new RefundAdjustmentService({ prisma } as never);

    const first = await service.cancelRefundOperation({
      paymentId,
      refundId,
      customerUserId,
      amount: '200000',
      actorUserId,
      reason: 'Superseded by admin override',
    });
    expect(first).toEqual({
      outcome: 'cancelled',
      operationId,
      transferId: tombstoneId,
      kind: 'refund',
      status: 'failed',
      amount: '200000',
      failureCode: REFUND_CANCELLED_FAILURE_CODE,
      idempotentReplay: false,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.walletTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operationId,
          idempotencyKey,
          kind: 'refund',
          totalAmount: 200000n,
          status: 'failed',
        }),
      }),
    );
    expect(tx.walletAuditLog.create).toHaveBeenCalledTimes(1);

    const replay = await service.cancelRefundOperation({
      paymentId,
      refundId,
      customerUserId,
      amount: '200000',
      actorUserId,
      reason: 'Superseded by admin override',
    });
    expect(replay).toEqual({
      outcome: 'cancelled',
      operationId,
      transferId: tombstoneId,
      kind: 'refund',
      status: 'failed',
      amount: '200000',
      failureCode: REFUND_CANCELLED_FAILURE_CODE,
      idempotentReplay: true,
    });
    expect(tx.walletTransfer.create).toHaveBeenCalledTimes(1);
  });

  it('cancelRefundOperation reports already_completed and never overwrites a committed refund', async () => {
    const paymentId = randomUUID();
    const refundId = randomUUID();
    const customerUserId = randomUUID();
    const transferId = randomUUID();
    const operationId = `${paymentId}:refund:${refundId}`;
    const idempotencyKey = `refund:${refundId}`;
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      walletTransfer: {
        findUnique: vi.fn().mockResolvedValue({
          id: transferId,
          operationId,
          idempotencyKey,
          kind: 'refund',
          totalAmount: 200000n,
          status: 'completed',
          metadata: {},
        }),
        create: vi.fn(),
      },
      walletAuditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    const service = new RefundAdjustmentService({ prisma } as never);

    const res = await service.cancelRefundOperation({
      paymentId,
      refundId,
      customerUserId,
      amount: '200000',
      reason: 'Attempt override after commit',
    });
    expect(res).toEqual({
      outcome: 'already_completed',
      operationId,
      transferId,
      kind: 'refund',
      status: 'completed',
      amount: '200000',
      idempotentReplay: true,
    });
    expect(tx.walletTransfer.create).not.toHaveBeenCalled();
    expect(tx.walletAuditLog.create).not.toHaveBeenCalled();
  });

  it('refund rejects a fenced/cancelled operationId with 409 without posting or emitting needs_review', async () => {
    const paymentId = randomUUID();
    const refundId = randomUUID();
    const userId = randomUUID();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      walletTransfer: {
        findUnique: vi.fn().mockResolvedValue({
          id: randomUUID(),
          operationId: `${paymentId}:refund:${refundId}`,
          idempotencyKey: `refund:${refundId}`,
          kind: 'refund',
          totalAmount: 0n,
          status: 'failed',
          metadata: { failureCode: REFUND_CANCELLED_FAILURE_CODE },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: any) => fn(tx)),
      outboxEvent: { findFirst: vi.fn(), create: vi.fn() },
      walletAuditLog: { create: vi.fn() },
    };
    const posting = vi.fn();
    const service = new RefundAdjustmentService({
      prisma,
      createBalancedTransferInTx: posting,
    } as never);

    await expect(
      service.refund(userId, {
        paymentId,
        refundId,
        amount: '200000',
        method: 'point',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(posting).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
    expect(prisma.walletAuditLog.create).not.toHaveBeenCalled();
  });
});
