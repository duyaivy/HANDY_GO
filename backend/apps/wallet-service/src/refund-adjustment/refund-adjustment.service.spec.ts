import { describe, expect, it, vi } from 'vitest';
import { RefundAdjustmentService } from './refund-adjustment.service.js';
describe('RefundAdjustmentService', () => {
  it('rejects a refund with no original payment', async () => {
    const tx = {
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
});
