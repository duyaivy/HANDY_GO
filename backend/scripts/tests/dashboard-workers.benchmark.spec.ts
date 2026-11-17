import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@app/config';
import type { Prisma } from '@prisma/user-trust-client';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { DashboardService } from '../../apps/order-service/src/dashboard/dashboard.service.js';
import { resolveDashboardPeriod } from '../../apps/order-service/src/dashboard/dashboard-period.js';
import { WorkersService } from '../../apps/user-trust-service/src/workers/workers.service.js';
import { WorkersController } from '../../apps/user-trust-service/src/workers/workers.controller.js';
import { InternalServiceGuard } from '../../apps/user-trust-service/src/common/guards/internal-service.guard.js';

const databaseUrl = process.env.DATABASE_URL_USER_TRUST;

// Integration harness spanning both services. All database sources are synthetic
// SELECT CTEs; the production aggregation, ranking and internal HTTP route run.
describe.skipIf(!databaseUrl)('dashboard workers 365-day benchmark', () => {
  it('ranks 10,000 tied workers over 3.65 million orders with one internal HTTP request', async () => {
    const client = new pg.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    let app: NestExpressApplication | undefined;
    try {
      await client.connect();
      let profileQueries = 0;
      let upstreamRequests = 0;
      let candidates: { workerUserId: string; completedOrderCount: number }[] =
        [];
      const profiles = new WorkersService({
        schema: 'benchmark_fixture',
        $queryRaw: async (query: Prisma.Sql) => {
          profileQueries++;
          const text = query.text
            .replace(
              'WITH candidates AS (',
              `WITH
            profiles AS (SELECT ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid AS user_id,
              CASE WHEN i = 10000 THEN 4.9 ELSE 4.0 END AS average_rating FROM generate_series(1, 10000) i),
            users AS (SELECT user_id AS id, 'Worker'::text AS full_name, NULL::text AS avatar_url FROM profiles),
            candidates AS (`,
            )
            .replace('"benchmark_fixture"."worker_profiles"', 'profiles')
            .replace('"benchmark_fixture"."users"', 'users');
          return (await client.query(text, query.values)).rows;
        },
      } as never);
      const module = await Test.createTestingModule({
        controllers: [WorkersController],
        providers: [
          InternalServiceGuard,
          {
            provide: ConfigService,
            useValue: { internalServiceSecret: 'benchmark-secret' },
          },
          { provide: WorkersService, useValue: profiles },
        ],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>();
      app.useBodyParser('json', { limit: '16mb' });
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({ transform: true, whitelist: true }),
      );
      app.use((_req: unknown, _res: unknown, next: () => void) => {
        upstreamRequests++;
        next();
      });
      await app.listen(0, '127.0.0.1');
      const baseUrl = await app.getUrl();
      const dashboard = new DashboardService(
        {
          $queryRaw: async (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => {
            const query = strings
              .reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '')
              .replace('order_service.orders', 'orders');
            candidates = (
              await client.query(
                `WITH orders AS (
            SELECT ('00000000-0000-4000-8000-' || lpad(worker::text, 12, '0'))::uuid AS worker_user_id,
              'completed'::text AS status, $1::timestamptz + (day - 1) * interval '1 day' AS completed_at
            FROM generate_series(1, 10000) worker CROSS JOIN generate_series(1, 365) day
          ) ${query}`,
                values,
              )
            ).rows;
            return candidates;
          },
        } as never,
        {
          get: () => baseUrl,
          internalServiceSecret: 'benchmark-secret',
        } as never,
      );
      const period = resolveDashboardPeriod(
        { period: 'custom', startDate: '2025-11-18', endDate: '2026-11-17' },
        new Date('2026-11-18T08:00:00Z'),
      );
      expect(
        (period.endExclusive.getTime() - period.start.getTime()) / 86400000,
      ).toBe(365);
      const started = performance.now();
      const ranked = await dashboard.topWorkers(period);
      const elapsedMs = Math.round(performance.now() - started);
      expect(candidates).toHaveLength(10000);
      expect(ranked.map((row) => row.workerUserId)).toEqual(
        [10000, 1, 2, 3, 4].map(
          (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      );
      expect(ranked.every((row) => row.completedOrderCount === 365)).toBe(true);
      expect(upstreamRequests).toBe(1);
      expect(profileQueries).toBe(1);
      const report = {
        periodDays: 365,
        workers: 10000,
        orders: 3650000,
        upstreamRequests,
        profileQueries,
        elapsedMs,
        requestBytes: Buffer.byteLength(JSON.stringify({ candidates })),
      };
      console.info(JSON.stringify(report));
      if (process.env.HG74_BENCHMARK_REPORT) {
        writeFileSync(
          process.env.HG74_BENCHMARK_REPORT,
          JSON.stringify(report, null, 2),
        );
      }
    } finally {
      await app?.close();
      await client.end();
    }
  }, 30000);
});
