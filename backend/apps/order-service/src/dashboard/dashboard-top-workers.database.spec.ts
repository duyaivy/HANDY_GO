import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import pg from 'pg';
import { DashboardService } from './dashboard.service.js';

const databaseUrl =
  process.env.DATABASE_URL_ORDER ?? process.env.DATABASE_URL_USER_TRUST;

describe.skipIf(!databaseUrl)('dashboard worker candidates PostgreSQL', () => {
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns all fifth-place ties, prunes lower counts and filters completion time and status', async () => {
    const id = (i: number) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const period = {
      start: new Date('2026-01-01T00:00:00Z'),
      endExclusive: new Date('2026-01-02T00:00:00Z'),
    };
    const fixtures = [6, 5, 4, 3, 2, 2, 1].map((count, i) => ({
      workerId: id(i + 1),
      count,
      status: 'completed',
      completedAt: period.start.toISOString(),
    }));
    fixtures.push(
      {
        workerId: id(8),
        count: 100,
        status: 'cancelled',
        completedAt: period.start.toISOString(),
      },
      {
        workerId: id(9),
        count: 100,
        status: 'completed',
        completedAt: period.endExclusive.toISOString(),
      },
      {
        workerId: id(10),
        count: 100,
        status: 'completed',
        completedAt: '2025-12-31T23:59:59Z',
      },
    );
    let candidates: { workerUserId: string; completedOrderCount: number }[] =
      [];
    const service = new DashboardService(
      {
        $queryRaw: async (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          // Execute the production query against synthetic orders, without
          // reading or writing application tables on the configured database.
          const query = strings
            .reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '')
            .replace('order_service.orders', 'orders');
          const result = await client.query(
            `WITH orders AS (
          SELECT entry."workerId" AS worker_user_id, entry.status, entry."completedAt" AS completed_at
          FROM jsonb_to_recordset($3::jsonb) AS entry("workerId" uuid, count integer, status text, "completedAt" timestamptz)
          CROSS JOIN LATERAL generate_series(1, entry.count)
        ) ${query}`,
            [...values, JSON.stringify(fixtures)],
          );
          candidates = result.rows;
          return candidates;
        },
      } as never,
      {
        get: () => 'http://user-trust:3002',
        internalServiceSecret: 'secret',
      } as never,
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [1, 2, 3, 4, 6].map((i) => ({
          workerUserId: id(i),
          completedOrderCount: [6, 5, 4, 3, 2, 2][i - 1],
          fullName: 'Worker',
          avatarUrl: null,
          averageRating: i === 6 ? 5 : 4,
        })),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (await service.topWorkers(period)).map((row) => row.workerUserId),
    ).toEqual([1, 2, 3, 4, 6].map(id));
    expect(candidates.map((row) => row.workerUserId).sort()).toEqual(
      [1, 2, 3, 4, 5, 6].map(id),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
