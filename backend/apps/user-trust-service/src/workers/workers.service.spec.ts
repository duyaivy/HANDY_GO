import { describe, it, expect, vi } from 'vitest';
import { UserTrustPrismaService } from '@app/database';
import { WorkersService } from './workers.service.js';
import { DASHBOARD_MAX_WORKER_CANDIDATES } from '@app/common';

describe('WorkersService', () => {
  it('rejects an oversized candidate set before querying PostgreSQL', async () => {
    const queryRaw = vi.fn();
    const service = new WorkersService({ $queryRaw: queryRaw } as never);
    await expect(
      service.rankDashboardWorkers(
        Array.from({ length: DASHBOARD_MAX_WORKER_CANDIDATES + 1 }, (_, i) => ({
          workerUserId: `worker-${i}`,
          completedOrderCount: 1,
        })),
      ),
    ).rejects.toThrow('candidate limit exceeded');
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('rejects duplicate ranking IDs before querying PostgreSQL', async () => {
    const queryRaw = vi.fn();
    const service = new WorkersService({ $queryRaw: queryRaw } as never);
    const workerUserId = '00000000-0000-4000-8000-000000000001';
    await expect(
      service.rankDashboardWorkers([
        { workerUserId, completedOrderCount: 2 },
        { workerUserId, completedOrderCount: 1 },
      ]),
    ).rejects.toThrow('Duplicate dashboard worker IDs');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('returns only public worker fields using one query and unique user IDs', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        userId: 'worker-1',
        user: { fullName: 'Nguyễn Văn An', avatarUrl: null },
        averageRating: '4.75',
        ratingCount: 8,
        completedOrderCount: 12,
        orderCountTotal: 15,
      },
    ]);
    const service = new WorkersService({
      workerProfile: { findMany },
    } as unknown as UserTrustPrismaService);
    expect(await service.getSummaries(['worker-1', 'worker-1'])).toEqual([
      {
        workerId: 'worker-1',
        fullName: 'Nguyễn Văn An',
        avatarUrl: null,
        averageRating: 4.75,
        ratingCount: 8,
        completedOrderCount: 12,
        orderCountTotal: 15,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['worker-1'] }, user: { status: 'active' } },
      }),
    );
  });

  it.each([0, 2])(
    'returns nullable dashboard ratings and profiles for inactive users (ratingCount=%i)',
    async (ratingCount) => {
      const findMany = vi.fn().mockResolvedValue([
        {
          userId: 'worker-1',
          user: { fullName: 'Nguyễn Văn An', avatarUrl: null },
          averageRating: '0',
          ratingCount,
        },
      ]);
      const service = new WorkersService({
        workerProfile: { findMany },
      } as unknown as UserTrustPrismaService);
      expect(
        await service.getDashboardSummaries(['worker-1', 'worker-1']),
      ).toEqual([
        {
          workerUserId: 'worker-1',
          fullName: 'Nguyễn Văn An',
          avatarUrl: null,
          averageRating: ratingCount > 0 ? 0 : null,
        },
      ]);
      expect(findMany).toHaveBeenCalledWith({
        where: { userId: { in: ['worker-1'] } },
        select: {
          userId: true,
          averageRating: true,
          ratingCount: true,
          user: { select: { fullName: true, avatarUrl: true } },
        },
      });
    },
  );
});
