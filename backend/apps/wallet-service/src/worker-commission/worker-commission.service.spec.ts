import { describe, expect, it, vi } from 'vitest';
import { WorkerCommissionService } from './worker-commission.service.js';
describe('WorkerCommissionService', () => {
  it('collects by a balanced idempotent transfer', async () => {
    const ledger = { prisma: { wallet: { findUnique: vi.fn().mockResolvedValue({ id: 'wallet' }) } }, createBalancedTransfer: vi.fn().mockResolvedValue({ id: 'transfer' }) };
    const service = new WorkerCommissionService(ledger as never);
    await service.collect({ paymentId: 'p', workerUserId: 'u', amount: '5', idempotencyKey: 'k' });
    expect(ledger.createBalancedTransfer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'commission_collection' }));
  });
});
