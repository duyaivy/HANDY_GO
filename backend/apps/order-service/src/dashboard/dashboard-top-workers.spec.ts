import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';
import { DASHBOARD_MAX_WORKER_CANDIDATES } from '@app/common';

const period = {
  start: new Date('2026-11-14T17:00:00Z'),
  endExclusive: new Date('2026-11-15T08:00:00Z'),
};
const workerId = (i: number) =>
  `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const candidate = (i: number, completedOrderCount = 1) => ({
  workerUserId: workerId(i),
  completedOrderCount,
});
const profile = (i: number, completedOrderCount = 1) => ({
  ...candidate(i, completedOrderCount),
  fullName: `Worker ${i}`,
  avatarUrl: null,
  averageRating: 4.9,
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(candidates: ReturnType<typeof candidate>[], data: unknown) {
  const queryRaw = vi.fn().mockResolvedValue(candidates);
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ data }) });
  vi.stubGlobal('fetch', fetchMock);
  const service = new DashboardService(
    { $queryRaw: queryRaw } as never,
    {
      get: () => 'http://user-trust:3002',
      internalServiceSecret: 'shared-secret',
    } as never,
  );
  return { service, queryRaw, fetchMock };
}

describe('dashboard top workers query', () => {
  it('filters by completion time and keeps fifth-place ties in PostgreSQL before one ranking request', async () => {
    const candidates = [6, 5, 4, 3, 2, 2].map((count, i) =>
      candidate(i + 1, count),
    );
    const ranked = [
      profile(1, 6),
      profile(2, 5),
      profile(3, 4),
      profile(4, 3),
      profile(6, 2),
    ];
    const { service, queryRaw, fetchMock } = setup(candidates, ranked);
    expect(await service.topWorkers(period)).toEqual(ranked);
    const sql = queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain('completed_at >=');
    expect(sql).toContain('completed_at <');
    expect(sql).toContain('FETCH FIRST 5 ROWS WITH TIES');
    expect(queryRaw.mock.calls[0].slice(1)).toEqual([
      period.start,
      period.endExclusive,
      DASHBOARD_MAX_WORKER_CANDIDATES + 1,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/internal/workers/dashboard-ranking');
    expect(options.method).toBe('POST');
    expect(options.headers['x-internal-secret']).toBe('shared-secret');
    expect(JSON.parse(options.body)).toEqual({ candidates });
  });

  it('finishes 10,000 tied candidates in one successful upstream round trip', async () => {
    vi.useFakeTimers();
    const candidates = Array.from({ length: 10_000 }, (_, i) =>
      candidate(i + 1),
    );
    const ranked = [
      profile(10_000),
      profile(1),
      profile(2),
      profile(3),
      profile(4),
    ];
    const { service, fetchMock } = setup(candidates, ranked);
    fetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      return { ok: true, json: async () => ({ data: ranked }) };
    });
    const result = service.topWorkers(period);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toEqual(ranked);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips User Trust for an empty period', async () => {
    const { service, fetchMock } = setup([], []);
    expect(await service.topWorkers(period)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized tie sets instead of sending or truncating them', async () => {
    const candidates = Array.from(
      { length: DASHBOARD_MAX_WORKER_CANDIDATES + 1 },
      (_, i) => candidate(i + 1),
    );
    const { service, fetchMock } = setup(candidates, []);
    await expect(service.topWorkers(period)).rejects.toThrow(
      'candidate limit exceeded',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the missing-profile placeholder and a null rating', async () => {
    const ranked = [
      { ...profile(1), fullName: 'Thợ không còn hồ sơ', averageRating: null },
    ];
    const { service } = setup([candidate(1)], ranked);
    expect(await service.topWorkers(period)).toEqual(ranked);
  });

  it.each(
    [
      null,
      [],
      [profile(2)],
      [profile(1, 2)],
      [{ ...profile(1), averageRating: '4.9' }],
      [{ ...profile(1), averageRating: 6 }],
      [profile(1), profile(1)],
    ].map((data) => ({ data })),
  )('fails closed for an invalid ranking: $data', async ({ data }) => {
    const { service } = setup([candidate(1)], data);
    await expect(service.topWorkers(period)).rejects.toThrow(
      'dashboard data unavailable',
    );
  });

  it('returns a service-unavailable error when User Trust fails or times out', async () => {
    const { service, fetchMock } = setup([candidate(1)], []);
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(service.topWorkers(period)).rejects.toThrow(
      'dashboard data unavailable',
    );
  });
});
