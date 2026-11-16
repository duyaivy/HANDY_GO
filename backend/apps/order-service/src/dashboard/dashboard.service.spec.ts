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

describe('dashboard order status query', () => {
  it('groups current status only for orders created in the selected period', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { status: 'completed', _count: { id: 2 } },
      { status: 'disputed', _count: { id: 1 } },
    ]);
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {} as never,
    );
    const period = {
      start: new Date('2026-11-14T17:00:00Z'),
      endExclusive: new Date('2026-11-15T08:00:00Z'),
    };
    const result = await service.orderStatus(period);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { createdAt: { gte: period.start, lt: period.endExclusive } },
      _count: { id: true },
    });
    expect(result.totalOrders).toBe(3);
    expect(result.groups.disputed.count).toBe(1);
    expect(result.groups.processing.count).toBe(0);
  });
});

describe('dashboard top workers query', () => {
  const period = {
    start: new Date('2026-11-14T17:00:00Z'),
    endExclusive: new Date('2026-11-15T08:00:00Z'),
  };

  it('counts completed orders by completedAt and resolves every fifth-place tie before ranking', async () => {
    const workerId = (i: number) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const counts = [6, 5, 4, 3, 2, 2, 1];
    const groupBy = vi.fn().mockResolvedValue(
      counts.map((count, index) => ({
        workerUserId: workerId(index + 1),
        _count: { id: count },
      })),
    );
    const fetchMock = vi.fn(
      async (url: URL, _options: { headers: Record<string, string> }) => ({
        ok: true,
        json: async () => ({
          data: url.searchParams
            .get('ids')!
            .split(',')
            .map((id) => ({
              workerUserId: id,
              fullName: `Worker ${id}`,
              avatarUrl: null,
              averageRating: id === workerId(6) ? 4.9 : 4.0,
            })),
        }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://user-trust:3002',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    const ranked = await service.topWorkers(period);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['workerUserId'],
      where: {
        status: 'completed',
        completedAt: { gte: period.start, lt: period.endExclusive },
      },
      _count: { id: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      (fetchMock.mock.calls[0][0] as URL).searchParams.get('ids')!.split(','),
    ).toHaveLength(6);
    expect(ranked.map((worker) => worker.workerUserId)).toEqual([
      workerId(1),
      workerId(2),
      workerId(3),
      workerId(4),
      workerId(6),
    ]);
    expect(ranked[4].completedOrderCount).toBe(2);
  });

  it('fetches more than 100 tied candidates in bounded batches', async () => {
    const workerId = (i: number) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const groupBy = vi.fn().mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({
        workerUserId: workerId(i + 1),
        _count: { id: 1 },
      })),
    );
    const fetchMock = vi.fn(
      async (url: URL, _options: { headers: Record<string, string> }) => ({
        ok: true,
        json: async () => ({
          data: url.searchParams
            .get('ids')!
            .split(',')
            .map((id) => ({
              workerUserId: id,
              fullName: id,
              avatarUrl: null,
              averageRating: Number(id.slice(-3)) / 100,
            })),
        }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://user-trust:3002',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    const ranked = await service.topWorkers(period);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(
        url.searchParams.get('ids')!.split(',').length,
      ).toBeLessThanOrEqual(100);
      expect(options.headers['x-internal-secret']).toBe('shared-secret');
    }
    expect(ranked[0].workerUserId).toBe(workerId(101));
  });

  it('returns an empty list without calling User Trust when no worker completed an order', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {} as never,
    );
    expect(await service.topWorkers(period)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails when User Trust is unavailable instead of returning a ranking with guessed ratings', async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue([
        {
          workerUserId: '00000000-0000-4000-8000-000000000001',
          _count: { id: 1 },
        },
      ]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://user-trust:3002',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    await expect(service.topWorkers(period)).rejects.toThrow(
      'dashboard data unavailable',
    );
  });
});

describe('dashboard top services query', () => {
  const period = {
    start: new Date('2026-11-14T17:00:00Z'),
    endExclusive: new Date('2026-11-15T08:00:00Z'),
  };
  const serviceId = (i: number) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

  it('counts by completedAt, orders equal counts by serviceId, and includes inactive services', async () => {
    const rows = [
      { serviceId: serviceId(1), _count: { id: 8 } },
      { serviceId: serviceId(2), _count: { id: 3 } },
    ];
    const groupBy = vi.fn().mockResolvedValue(rows);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: serviceId(1), name: 'Vệ sinh', iconUrl: '/clean.svg' },
          { id: serviceId(2), name: 'Sửa điện', iconUrl: null },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://catalog:3003',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    expect(await service.topServices(period)).toEqual([
      {
        serviceId: serviceId(1),
        name: 'Vệ sinh',
        iconUrl: '/clean.svg',
        completedOrderCount: 8,
      },
      {
        serviceId: serviceId(2),
        name: 'Sửa điện',
        iconUrl: null,
        completedOrderCount: 3,
      },
    ]);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['serviceId'],
      where: {
        status: 'completed',
        completedAt: { gte: period.start, lt: period.endExclusive },
      },
      _count: { id: true },
      orderBy: [{ _count: { id: 'desc' } }, { serviceId: 'asc' }],
      take: 5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      { headers: Record<string, string> },
    ];
    expect(url.pathname).toBe('/api/v1/internal/services/dashboard-summaries');
    expect(url.searchParams.get('ids')).toBe(`${serviceId(1)},${serviceId(2)}`);
    expect(options.headers['x-internal-secret']).toBe('shared-secret');
  });

  it('keeps counts when a catalog record has been deleted', async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue([{ serviceId: serviceId(1), _count: { id: 4 } }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      })),
    );
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://catalog:3003',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    expect(await service.topServices(period)).toEqual([
      {
        serviceId: serviceId(1),
        name: 'Dịch vụ không còn hồ sơ',
        iconUrl: null,
        completedOrderCount: 4,
      },
    ]);
  });

  it('returns an empty array without calling Catalog for an empty period', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {} as never,
    );
    expect(await service.topServices(period)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails instead of returning guessed catalog data when Catalog is unavailable', async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue([{ serviceId: serviceId(1), _count: { id: 1 } }]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://catalog:3003',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    await expect(service.topServices(period)).rejects.toThrow(
      'dashboard data unavailable',
    );
  });

  it('rejects malformed Catalog summaries instead of treating them as deleted services', async () => {
    const groupBy = vi
      .fn()
      .mockResolvedValue([{ serviceId: serviceId(1), _count: { id: 1 } }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: serviceId(1), name: 'Vệ sinh', iconUrl: 42 }],
        }),
      })),
    );
    const service = new DashboardService(
      { order: { groupBy } } as never,
      {
        get: () => 'http://catalog:3003',
        internalServiceSecret: 'shared-secret',
      } as never,
    );
    await expect(service.topServices(period)).rejects.toThrow(
      'dashboard data unavailable',
    );
  });
});
