import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';

afterEach(() => vi.unstubAllGlobals());

describe('dashboard overview', () => {
  const period = {
    start: new Date('2026-11-14T17:00:00.000Z'),
    endExclusive: new Date('2026-11-15T08:00:00.000Z'),
  };

  function setup() {
    const prisma = {
      order: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { agreedPrice: { toNumber: () => 750000.5 } },
        }),
        count: vi.fn().mockResolvedValue(4),
        groupBy: vi
          .fn()
          .mockResolvedValue([
            { workerUserId: 'worker-1' },
            { workerUserId: 'worker-2' },
          ]),
      },
    };
    const config = {
      get: (key: string) =>
        key === 'BIDDING_SERVICE_URL'
          ? 'http://bidding:3005'
          : 'http://auth:3001',
      internalServiceSecret: 'shared-secret',
    };
    const fetchMock = vi.fn(
      async (url: URL, _options: { headers: Record<string, string> }) => ({
        ok: true,
        json: async () => ({
          data: url.pathname.endsWith('workers-with-bids')
            ? ['worker-1', 'worker-3', 'worker-3']
            : 17,
        }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new DashboardService(prisma as never, config as never);
    return { service, prisma, fetchMock };
  }

  it('uses distinct bid/order worker IDs and different dates for revenue and orders', async () => {
    const { service, prisma, fetchMock } = setup();
    expect(await service.overview(period)).toEqual({
      revenue: { total: 750000.5, currency: 'VND' },
      orders: { total: 4 },
      workers: { activeInPeriod: 3 },
      customers: { totalCumulative: 17 },
    });
    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        status: 'completed',
        completedAt: { gte: period.start, lt: period.endExclusive },
      },
      _sum: { agreedPrice: true },
    });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: period.start, lt: period.endExclusive } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url.searchParams.get('endExclusive')).toBe(
        period.endExclusive.toISOString(),
      );
      expect(options.headers['x-internal-secret']).toBe('shared-secret');
    }
  });

  it('returns zeros for an empty period', async () => {
    const { service, prisma } = setup();
    prisma.order.aggregate.mockResolvedValue({ _sum: { agreedPrice: null } });
    prisma.order.count.mockResolvedValue(0);
    prisma.order.groupBy.mockResolvedValue([]);
    expect((await service.overview(period)).revenue.total).toBe(0);
  });

  it('fails if an upstream metric is unavailable instead of showing a false zero', async () => {
    const { service } = setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(service.overview(period)).rejects.toThrow(
      'dashboard data unavailable',
    );
  });
});

describe('dashboard order trend query', () => {
  it('groups all created orders within the exact selected range in Vietnam time', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([
        { bucketStart: new Date('2026-11-14T17:00:00Z'), orderCount: 2n },
      ]);
    const service = new DashboardService(
      { $queryRaw: queryRaw } as never,
      {} as never,
    );
    const period = {
      start: new Date('2026-11-14T17:00:00Z'),
      endExclusive: new Date('2026-11-15T08:00:00Z'),
    };
    const result = await service.orderTrend(period, 'day');
    expect(result.timeline).toEqual([{ bucket: '2026-11-15', orderCount: 2 }]);
    const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(sql).toContain("created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain('created_at >=');
    expect(sql).toContain('created_at <');
    expect(sql).not.toContain('status');
    expect(queryRaw.mock.calls[0]).toContain(period.start);
    expect(queryRaw.mock.calls[0]).toContain(period.endExclusive);
  });
});
