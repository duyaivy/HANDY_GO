import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EVENT_PATTERNS, OutboxPublisherService } from '@app/common';
import { RedisService } from '@app/redis';
import { SUGGESTION_GROUPS_SWAGGER_EXAMPLE } from '../common/dto/suggestion-group.dto.js';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;
  let outboxPublisher: any;
  let redis: any;

  const mockCategory = {
    id: '11111111-1111-1111-1111-111111111111',
    parentId: null,
    name: 'Dọn dẹp nhà',
    description: 'Dịch vụ dọn dẹp',
    imageUrl: 'https://example.com/clean.png',
    suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      category: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxPublisherService, useValue: outboxPublisher },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should successfully create a top-level category with suggestionGroups and invalidate catalog caches', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);

      const result = await service.create({
        name: 'Dọn dẹp nhà',
        description: 'Dịch vụ dọn dẹp',
        suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
      });

      expect(result).toEqual(mockCategory);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Dọn dẹp nhà',
          suggestionGroups: SUGGESTION_GROUPS_SWAGGER_EXAMPLE,
        }),
      });
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: EVENT_PATTERNS.CATEGORY_CREATED,
          payload: expect.objectContaining({
            id: mockCategory.id,
            name: mockCategory.name,
          }),
        },
      });
      expect(outboxPublisher.triggerPublish).toHaveBeenCalled();
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:categories:*');
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:category:*');
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:services:*');
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:service:*');
    });

    it('should throw NotFoundException if parentId does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Dọn phòng khách',
          parentId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if category name exists under same parent', async () => {
      prisma.category.findFirst.mockResolvedValue(mockCategory);

      await expect(
        service.create({
          name: 'Dọn dẹp nhà',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated list of categories and cache under v3 key', async () => {
      prisma.category.count.mockResolvedValue(1);
      prisma.category.findMany.mockResolvedValue([
        { ...mockCategory, parent: null, _count: { children: 0, services: 2 } },
      ]);

      const result = (await service.findAll({ page: 1, limit: 10 })) as any;

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('catalog:categories:list:v3:'),
        result,
        300,
      );
    });
  });

  describe('findOne', () => {
    it('should return category details including parent.suggestionGroups and cache under v2 key', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        parent: null,
        children: [],
        services: [],
        _count: { services: 0, children: 0 },
      });

      const result = (await service.findOne(mockCategory.id)) as any;

      expect(result.id).toBe(mockCategory.id);
      expect(prisma.category.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockCategory.id },
          include: expect.objectContaining({
            parent: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                suggestionGroups: true,
              },
            },
          }),
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(
        `catalog:category:v2:${mockCategory.id}`,
        expect.any(Object),
        3600,
      );
    });

    it('should throw NotFoundException when category is missing', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update category details, clear suggestionGroups with DbNull when null, and invalidate all catalog caches', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);
      prisma.category.findFirst.mockResolvedValue(null);
      prisma.category.update.mockResolvedValue({
        ...mockCategory,
        name: 'Dọn dẹp nhà cửa',
        suggestionGroups: null,
      });

      const result = await service.update(mockCategory.id, {
        name: 'Dọn dẹp nhà cửa',
        suggestionGroups: null,
      });

      expect(result.name).toBe('Dọn dẹp nhà cửa');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: {
          name: 'Dọn dẹp nhà cửa',
          suggestionGroups: Prisma.DbNull,
        },
      });
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: EVENT_PATTERNS.CATEGORY_UPDATED,
          payload: expect.objectContaining({
            id: mockCategory.id,
            name: 'Dọn dẹp nhà cửa',
          }),
        },
      });
      expect(outboxPublisher.triggerPublish).toHaveBeenCalled();
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:categories:*');
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:category:*');
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:services:*');
      expect(redis.delByPattern).toHaveBeenCalledWith('catalog:service:*');
    });

    it('should throw BadRequestException if category sets parent to itself', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);

      await expect(
        service.update(mockCategory.id, { parentId: mockCategory.id }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should soft delete category by setting isActive=false and emit CATEGORY_STATUS_CHANGED event', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        _count: { children: 0, services: 0 },
      });
      prisma.category.update.mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      const result = await service.remove(mockCategory.id, false);

      expect(result.message).toContain('deactivated');
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: EVENT_PATTERNS.CATEGORY_STATUS_CHANGED,
          payload: expect.objectContaining({
            id: mockCategory.id,
            isActive: false,
          }),
        },
      });
    });

    it('should hard delete category when hard=true and emit CATEGORY_DELETED event', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        _count: { children: 0, services: 0 },
      });
      prisma.category.delete.mockResolvedValue(mockCategory);

      const result = await service.remove(mockCategory.id, true);

      expect(result.message).toContain('deleted successfully');
      expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: EVENT_PATTERNS.CATEGORY_DELETED,
          payload: expect.objectContaining({
            id: mockCategory.id,
            hard: true,
          }),
        },
      });
    });

    it('should throw BadRequestException on hard delete if category has children', async () => {
      prisma.category.findUnique.mockResolvedValue({
        ...mockCategory,
        _count: { children: 2, services: 0 },
      });

      await expect(service.remove(mockCategory.id, true)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
