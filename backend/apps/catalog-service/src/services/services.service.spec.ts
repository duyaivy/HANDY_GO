import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../categories/categories.service.js';
import { ServicesService } from './services.service.js';
import { SUGGESTION_GROUPS_SWAGGER_EXAMPLE } from '../common/dto/suggestion-group.dto.js';
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
    const redis = { get: vi.fn(), set: vi.fn(), delByPattern: vi.fn() };
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
                      select: {
                        id: true,
                        name: true,
                        imageUrl: true,
                        suggestionGroups: true,
                      },
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
          expect.stringContaining(`catalog:${kind}:list:v3:`),
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

describe('ServicesService suggestionGroups & cache behavior', () => {
  let servicesService: ServicesService;
  let prisma: any;
  let outboxPublisher: any;
  let redis: any;

  const mockCategory = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Điện lạnh',
    imageUrl: null,
    suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
  };

  const mockServiceRow = {
    id: '34ec7df5-20db-401e-804a-6feee5b48184',
    categoryId: mockCategory.id,
    name: 'Sửa máy lạnh',
    description: 'Kiểm tra và sửa chữa máy lạnh',
    iconUrl: null,
    suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    category: mockCategory,
  };

  beforeEach(() => {
    prisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue(mockCategory),
      },
      service: {
        findUnique: vi.fn().mockResolvedValue(mockServiceRow),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([mockServiceRow]),
        create: vi.fn().mockResolvedValue(mockServiceRow),
        update: vi.fn().mockResolvedValue(mockServiceRow),
        delete: vi.fn().mockResolvedValue(mockServiceRow),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (cb: any) => cb(prisma)),
    };

    outboxPublisher = {
      triggerPublish: vi.fn().mockResolvedValue(undefined),
    };

    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      delByPattern: vi.fn().mockResolvedValue(true),
    };

    servicesService = new ServicesService(
      prisma as unknown as PrismaService,
      outboxPublisher as unknown as OutboxPublisherService,
      redis as unknown as RedisService,
    );
  });

  it('persists suggestionGroups on create, includes category.suggestionGroups, and invalidates caches', async () => {
    const created = await servicesService.create({
      categoryId: mockCategory.id,
      name: 'Sửa máy lạnh',
      suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
    });

    expect(created).toEqual(mockServiceRow);
    expect(prisma.service.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        categoryId: mockCategory.id,
        name: 'Sửa máy lạnh',
        suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
      }),
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            suggestionGroups: true,
          },
        },
      },
    });
    expect(redis.delByPattern).toHaveBeenCalledWith('catalog:services:*');
    expect(redis.delByPattern).toHaveBeenCalledWith('catalog:service:*');
    expect(redis.delByPattern).toHaveBeenCalledWith('catalog:categories:*');
    expect(redis.delByPattern).toHaveBeenCalledWith('catalog:category:*');
  });

  it('includes category.suggestionGroups on findOne and caches under catalog:service:v2:${id}', async () => {
    const found = await servicesService.findOne(mockServiceRow.id);

    expect(found).toEqual(mockServiceRow);
    expect(prisma.service.findUnique).toHaveBeenCalledWith({
      where: { id: mockServiceRow.id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            parentId: true,
            isActive: true,
            suggestionGroups: true,
          },
        },
      },
    });
    expect(redis.set).toHaveBeenCalledWith(
      `catalog:service:v2:${mockServiceRow.id}`,
      mockServiceRow,
      3600,
    );
  });

  it('clears suggestionGroups with Prisma.DbNull when updating with null and includes category.suggestionGroups', async () => {
    await servicesService.update(mockServiceRow.id, {
      suggestionGroups: null,
    });

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: mockServiceRow.id },
      data: {
        suggestionGroups: Prisma.DbNull,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            suggestionGroups: true,
          },
        },
      },
    });
    expect(redis.delByPattern).toHaveBeenCalledWith('catalog:service:*');
  });

  it('includes category.suggestionGroups on toggleStatus and invalidates caches', async () => {
    await servicesService.toggleStatus(mockServiceRow.id, false);

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: mockServiceRow.id },
      data: { isActive: false },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            suggestionGroups: true,
          },
        },
      },
    });
    expect(redis.delByPattern).toHaveBeenCalledWith('catalog:service:*');
  });
});
