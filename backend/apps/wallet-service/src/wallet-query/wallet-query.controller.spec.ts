import { describe, expect, it, vi } from 'vitest';
import { WalletQueryController } from './wallet-query.controller.js';

describe('WalletQueryController', () => {
  const config = { internalServiceSecret: 'secret' } as any;

  it('rejects requests without trusted gateway secret', async () => {
    const controller = new WalletQueryController({} as any, config);
    await expect(controller.getMyWallet(undefined, 'u1', 'Customer', {} as any, '127.0.0.1'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('returns current user wallet using trusted gateway identity', async () => {
    const service = { getWallet: vi.fn().mockResolvedValue({ balance: '1' }) };
    const controller = new WalletQueryController(service as any, config);
    const req = { headers: { 'x-internal-secret': 'secret' }, socket: { remoteAddress: '127.0.0.1' } } as any;
    await expect(controller.getMyWallet('secret', 'u1', 'Customer', req, '127.0.0.1'))
      .resolves.toMatchObject({ data: { balance: '1' } });
    expect(service.getWallet).toHaveBeenCalledWith('u1');
  });

  it('rejects a mismatched internal secret', async () => {
    const controller = new WalletQueryController({} as any, config);
    await expect(controller.getInternalBalance('wrong', 'u1', {} as any, '127.0.0.1'))
      .rejects.toMatchObject({ status: 403 });
  });
});
