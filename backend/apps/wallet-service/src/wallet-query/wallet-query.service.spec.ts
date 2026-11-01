import { describe, expect, it, vi } from 'vitest';
import { WalletQueryService, type WalletQueryRepository } from './wallet-query.service.js';

const wallet = {
  id: 'wallet-1', userId: 'user-1', balance: 1000n, reservedBalance: 250n,
  status: 'active', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function makeService() {
  const repository: WalletQueryRepository = {
    findWalletByUserId: vi.fn().mockResolvedValue(wallet),
    findTransaction: vi.fn().mockResolvedValue({
      id: 'tx-1', walletId: wallet.id, type: 'credit', amount: 50n,
      status: 'completed', createdAt: new Date('2026-01-02T00:00:00Z'),
    }),
    findTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  return { service: new WalletQueryService(repository), repository };
}

describe('WalletQueryService', () => {
  it('returns balance fields as safe decimal strings', async () => {
    const { service } = makeService();
    await expect(service.getWallet('user-1')).resolves.toMatchObject({
      balance: '1000', reservedBalance: '250', availableBalance: '750', status: 'active',
    });
  });

  it('passes pagination and filters to the repository', async () => {
    const { service, repository } = makeService();
    await service.getTransactions('user-1', { page: 3, limit: 10, type: 'credit', status: 'completed' });
    expect(repository.findTransactions).toHaveBeenCalledWith(expect.objectContaining({
      walletId: 'wallet-1', skip: 20, take: 10, type: 'credit', status: 'completed',
    }));
  });

  it('scopes transaction detail lookup to the owner wallet', async () => {
    const { service, repository } = makeService();
    await service.getTransaction('user-1', 'tx-1');
    expect(repository.findTransaction).toHaveBeenCalledWith('wallet-1', 'tx-1');
  });

  it('rejects an inverted date range', async () => {
    const { service } = makeService();
    await expect(service.getTransactions('user-1', {
      page: 1, limit: 20, from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z',
    })).rejects.toMatchObject({ status: 400 });
  });
});
