import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesService } from '../categories/categories.service.js';
import { ServicesService } from './services.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OutboxPublisherService } from '@app/common';
import type { RedisService } from '@app/redis';

for (const kind of ['categories', 'services'] as const) {
  describe(`${kind} list query compatibility`, () => {
    const delegate = { count: vi.fn(), findMany: vi.fn() };
    const prisma = {
      category: delegate,
      service: delegate,
      $queryRaw: vi.fn(),
    };
    const redis = { get: vi.fn(), set: vi.fn() };
    const Constructor =
      kind === 'categories' ? CategoriesService : ServicesService;
    const service = new Constructor(
      prisma as unknown as PrismaService,
      {} as OutboxPublisherService,
      redis as unknown as RedisService,
    );

    beforeEach(() => {
      vi.resetAllMocks();
      redis.get.mockResolvedValue(null);
      delegate.count.mockResolvedValue(9);
      delegate.findMany.mockResolvedValue([{ id: 'one', name: 'One' }]);
    });

    it.each([undefined, ''])(
      'retains ORM filters, order and paging without search (%s)',
      async (search) => {
        const filter =
          kind === 'categories'
            ? { parentId: 'parent' }
            : { categoryId: 'category' };
        const result = (await service.findAll({
          ...filter,
          isActive: false,
          search,
          page: 2,
          limit: 5,
        })) as any;
        const where = { ...filter, isActive: false };
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(delegate.count).toHaveBeenCalledWith({ where });
        expect(delegate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where,
            skip: 5,
            take: 5,
            orderBy:
              kind === 'categories'
                ? [{ parentId: 'asc' }, { name: 'asc' }]
                : [{ name: 'asc' }],
            include:
              kind === 'categories'
                ? {
                    parent: { select: { id: true, name: true } },
                    _count: { select: { children: true, services: true } },
                  }
                : {
                    category: {
                      select: { id: true, name: true, imageUrl: true },
                    },
                  },
          }),
        );
        expect(result.meta).toEqual({
          total: 9,
          page: 2,
          limit: 5,
          totalPages: 2,
        });
        expect(redis.set).toHaveBeenCalledWith(
          expect.stringContaining(`catalog:${kind}:`),
          result,
          300,
        );
      },
    );

    it('returns warm cache without querying PostgreSQL', async () => {
      const cached = { data: [{ id: 'cached' }], meta: { total: 1 } };
      redis.get.mockResolvedValue(cached);
      expect(await service.findAll({ search: 'cat tia' })).toBe(cached);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(delegate.count).not.toHaveBeenCalled();
      expect(delegate.findMany).not.toHaveBeenCalled();
    });
  });
}
