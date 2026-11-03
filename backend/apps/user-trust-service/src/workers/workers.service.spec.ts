import { describe, it, expect, vi } from 'vitest';
import { UserTrustPrismaService } from '@app/database';
import { WorkersService } from './workers.service.js';

describe('WorkersService', () => {
  it('returns only public worker fields using one query and unique user IDs', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        userId: 'worker-1',
        user: { fullName: 'Nguyễn Văn An', avatarUrl: null },
        averageRating: '4.75',
        ratingCount: 8,
        completedOrderCount: 12,
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
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: { in: ['worker-1'] }, user: { status: 'active' } },
      }),
    );
  });
});
