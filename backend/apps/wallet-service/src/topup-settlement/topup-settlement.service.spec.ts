import { describe, expect, it, vi } from 'vitest';
import { TopupSettlementService } from './topup-settlement.service.js';
describe('TopupSettlementService', () => {
  it('refuses to credit a missing wallet', async () => {
    const prisma = { $transaction: vi.fn(async (fn) => fn({ walletTransaction: { findUnique: vi.fn().mockResolvedValue(null) }, wallet: { findUnique: vi.fn().mockResolvedValue(null) } })) };
    const service = new TopupSettlementService(prisma as never);
    await expect(service.settle({ userId: 'u', paymentId: 'p', amount: '50', idempotencyKey: 'key' })).rejects.toMatchObject({ status: 404 });
  });
});
