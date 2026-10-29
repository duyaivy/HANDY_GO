import { describe, expect, it, vi } from 'vitest';
import { WalletProvisioningService } from './wallet-provisioning.service.js';
describe('WalletProvisioningService', () => {
  it('creates the system platform wallet idempotently', async () => {
    const expected = { id: 'platform' };
    const prisma = { wallet: { upsert: vi.fn().mockResolvedValue(expected) } };
    const service = new WalletProvisioningService(prisma as never);
    await expect(service.seedPlatformWallet()).resolves.toEqual(expected);
    expect(prisma.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { systemKey: 'PLATFORM_FEES' } }));
  });
});
