import { describe, expect, it, vi } from 'vitest';
import { RefundAdjustmentService } from './refund-adjustment.service.js';
describe('RefundAdjustmentService', () => {
  it('rejects a refund with no original payment', async () => {
    const ledger = { prisma: { walletTransfer: { findFirst: vi.fn().mockResolvedValue(null) } } };
    const service = new RefundAdjustmentService(ledger as never);
    await expect(service.refund('u1', { paymentId: 'p1', refundId: 'r1', amount: '10' })).rejects.toMatchObject({ status: 404 });
  });
});
