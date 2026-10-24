import { describe, expect, it, vi } from 'vitest';
import { WithdrawalService } from './withdrawal.service.js';
describe('WithdrawalService', () => {
  it('rejects creation if no wallet is found', async () => {
    const prisma = { $transaction: vi.fn(async (fn) => fn({ withdrawal: { findUnique: vi.fn().mockResolvedValue(null) }, wallet: { findUnique: vi.fn().mockResolvedValue(null) } })) };
    const service = new WithdrawalService(prisma as never);
    await expect(service.create('user', { amount: '100', bankAccountId: 'bank', idempotencyKey: 'key' })).rejects.toMatchObject({ status: 404 });
  });
});
