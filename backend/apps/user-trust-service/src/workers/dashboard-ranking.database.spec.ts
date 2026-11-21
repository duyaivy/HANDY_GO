import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { Prisma } from '@prisma/user-trust-client';
import { WorkersService } from './workers.service.js';

// Only SELECTs over synthetic CTEs; never reads or mutates application records.
describe.skipIf(!process.env.DATABASE_URL_USER_TRUST)(
  'dashboard ranking PostgreSQL',
  () => {
    let client: pg.Client;
    beforeAll(async () => {
      client = new pg.Client({
        connectionString: process.env.DATABASE_URL_USER_TRUST,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
      });
      await client.connect();
    });
    afterAll(async () => {
      await client?.end();
    });

    const id = (i: number) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    function setup(
      profiles: { userId: string; rating: number; ratingCount?: number }[],
    ) {
      return new WorkersService({
        schema: 'ranking_fixture',
        $queryRaw: async (query: Prisma.Sql) => {
          const text = query.text
            .replace(
              'WITH candidates AS (',
              `WITH
            profiles AS (SELECT * FROM jsonb_to_recordset($2::jsonb)
              AS p(user_id uuid, average_rating numeric, rating_count integer)),
            users AS (SELECT user_id AS id, 'Worker'::text AS full_name,
              NULL::text AS avatar_url FROM profiles),
            candidates AS (`,
            )
            .replace('"ranking_fixture"."worker_profiles"', 'profiles')
            .replace('"ranking_fixture"."users"', 'users');
          const result = await client.query(text, [
            ...query.values,
            JSON.stringify(
              profiles.map((row) => ({
                user_id: row.userId,
                average_rating: row.rating,
                rating_count: row.ratingCount ?? 1,
              })),
            ),
          ]);
          return result.rows;
        },
      } as never);
    }

    it('finds the highest current rating among 10,000 fifth-place ties', async () => {
      const candidates = Array.from({ length: 10_000 }, (_, i) => ({
        workerUserId: id(i + 1),
        completedOrderCount: 1,
      }));
      const service = setup(
        candidates.map((row) => ({
          userId: row.workerUserId,
          rating: row.workerUserId === id(10_000) ? 4.9 : 4.0,
        })),
      );
      const rows = await service.rankDashboardWorkers(candidates);
      expect(rows.map((row) => row.workerUserId)).toEqual([
        id(10_000),
        id(1),
        id(2),
        id(3),
        id(4),
      ]);
      expect(rows[0].averageRating).toBe(4.9);
      expect(rows[0].completedOrderCount).toBe(1);
    });

    it('sorts by count before rating and keeps missing profiles below zero-rated profiles', async () => {
      const service = setup([
        { userId: id(2), rating: 0 },
        { userId: id(3), rating: 5 },
      ]);
      const rows = await service.rankDashboardWorkers([
        { workerUserId: id(1), completedOrderCount: 2 },
        { workerUserId: id(2), completedOrderCount: 2 },
        { workerUserId: id(3), completedOrderCount: 1 },
      ]);
      expect(rows.map((row) => row.workerUserId)).toEqual([
        id(2),
        id(1),
        id(3),
      ]);
      expect(rows[1]).toEqual({
        workerUserId: id(1),
        completedOrderCount: 2,
        fullName: 'Thợ không còn hồ sơ',
        avatarUrl: null,
        averageRating: null,
      });
    });

    it('uses worker ID to break equal counts and ratings, including missing profiles', async () => {
      const service = setup([]);
      const rows = await service.rankDashboardWorkers(
        [3, 1, 2].map((i) => ({
          workerUserId: id(i),
          completedOrderCount: 2,
        })),
      );
      expect(rows.map((row) => row.workerUserId)).toEqual([
        id(1),
        id(2),
        id(3),
      ]);
    });

    it('returns null for unrated profiles and ignores stale averages when breaking ties', async () => {
      const service = setup([
        { userId: id(1), rating: 5, ratingCount: 0 },
        { userId: id(2), rating: 1, ratingCount: 3 },
        { userId: id(4), rating: 0, ratingCount: 1 },
      ]);
      const rows = await service.rankDashboardWorkers(
        [1, 2, 3, 4].map((i) => ({
          workerUserId: id(i),
          completedOrderCount: 2,
        })),
      );
      expect(rows.map((row) => row.workerUserId)).toEqual([
        id(2),
        id(4),
        id(1),
        id(3),
      ]);
      expect(
        rows.find((row) => row.workerUserId === id(1))?.averageRating,
      ).toBeNull();
      expect(rows.find((row) => row.workerUserId === id(1))?.fullName).toBe(
        'Worker',
      );
      expect(
        rows.find((row) => row.workerUserId === id(3))?.averageRating,
      ).toBeNull();
    });
  },
);
