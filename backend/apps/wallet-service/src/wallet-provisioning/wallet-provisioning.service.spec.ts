import { describe, expect, it, vi } from 'vitest';
import { WalletProvisioningService } from './wallet-provisioning.service.js';
describe('WalletProvisioningService', () => {
  it.each(['P2021', 'P1001'])('fails startup on database error %s', async (code) => {
    const error = Object.assign(new Error('Database unavailable or schema missing'), { code });
    const prisma = { wallet: { upsert: vi.fn().mockRejectedValue(error) } };
    const service = new WalletProvisioningService(prisma as never);
    await expect(service.onModuleInit()).rejects.toBe(error);
  });
  it('creates the system platform wallet idempotently', async () => {
    const expected = { id: 'platform' };
    const prisma = { wallet: { upsert: vi.fn().mockResolvedValue(expected) } };
    const service = new WalletProvisioningService(prisma as never);
    await expect(service.seedPlatformWallet()).resolves.toEqual(expected);
    expect(prisma.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { systemKey: 'PLATFORM_FEES' } }));
  });
});
