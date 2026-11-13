import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopupSettlementService } from './topup-settlement.service.js';
describe('TopupSettlementService', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('never credits a simulated top-up in production or without sandbox opt-in', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new TopupSettlementService(prisma as never);
    const dto = { userId: 'u', paymentId: 'p', amount: '50', idempotencyKey: 'key', provider: 'mock', isSimulated: true };
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('TOPUP_MOCK_ENABLED', 'true');
    await expect(service.settle(dto)).rejects.toMatchObject({ status: 403 });
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('TOPUP_MOCK_ENABLED', 'false');
    await expect(service.settle(dto)).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('refuses to credit a missing wallet', async () => {
    const prisma = { $transaction: vi.fn(async (fn) => fn({ walletTransaction: { findUnique: vi.fn().mockResolvedValue(null) }, wallet: { findUnique: vi.fn().mockResolvedValue(null) } })) };
    const service = new TopupSettlementService(prisma as never);
    await expect(service.settle({ userId: 'u', paymentId: 'p', amount: '50', idempotencyKey: 'key' })).rejects.toMatchObject({ status: 404 });
  });
});
