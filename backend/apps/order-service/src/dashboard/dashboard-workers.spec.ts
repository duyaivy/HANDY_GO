import { describe, expect, it } from 'vitest';
import { rankTopWorkers, topWorkerCandidates } from './dashboard-workers.js';

describe('dashboard top workers', () => {
  it('keeps every worker tied at the fifth count before rating comparison', () => {
    const rows = [6, 5, 4, 3, 2, 2, 1].map((count, index) => ({
      workerUserId: `worker-${index + 1}`,
      _count: { id: count },
    }));
    const candidates = topWorkerCandidates(rows);
    expect(candidates.map((row) => row.workerUserId)).toEqual([
      'worker-1',
      'worker-2',
      'worker-3',
      'worker-4',
      'worker-5',
      'worker-6',
    ]);
    const ranked = rankTopWorkers(
      candidates,
      candidates.map((row) => ({
        workerUserId: row.workerUserId,
        fullName: row.workerUserId,
        avatarUrl: null,
        averageRating: row.workerUserId === 'worker-6' ? 4.9 : 4.1,
      })),
    );
    expect(ranked.map((row) => row.workerUserId)).toEqual([
      'worker-1',
      'worker-2',
      'worker-3',
      'worker-4',
      'worker-6',
    ]);
  });

  it('uses current rating then worker ID to break equal order counts', () => {
    const rows = ['b', 'a', 'c'].map((workerUserId) => ({
      workerUserId,
      _count: { id: 2 },
    }));
    const ranked = rankTopWorkers(rows, [
      { workerUserId: 'a', fullName: 'A', avatarUrl: null, averageRating: 4.7 },
      { workerUserId: 'b', fullName: 'B', avatarUrl: null, averageRating: 4.7 },
      { workerUserId: 'c', fullName: 'C', avatarUrl: null, averageRating: 5 },
    ]);
    expect(ranked.map((row) => row.workerUserId)).toEqual(['c', 'a', 'b']);
  });

  it('retains completed orders for a missing profile and returns an empty list for no orders', () => {
    expect(
      rankTopWorkers([{ workerUserId: 'removed', _count: { id: 1 } }], []),
    ).toEqual([
      {
        workerUserId: 'removed',
        fullName: 'Thợ không còn hồ sơ',
        avatarUrl: null,
        completedOrderCount: 1,
        averageRating: null,
      },
    ]);
    expect(rankTopWorkers([], [])).toEqual([]);
  });
});
