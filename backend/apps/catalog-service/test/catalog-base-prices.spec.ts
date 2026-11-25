import { describe, expect, it, vi } from 'vitest';
import { CreateServiceDto } from '../src/services/dto/create-service.dto.js';
import { UpdateServiceDto } from '../src/services/dto/update-service.dto.js';
import { ServiceResponseDto } from '../src/services/dto/service-response.dto.js';
import { ServicesService } from '../src/services/services.service.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('Catalog Service Base Prices', () => {
  it('validates CreateServiceDto with basePriceMin and basePriceMax', async () => {
    const validDto = plainToInstance(CreateServiceDto, {
      categoryId: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      basePriceMin: 150000,
      basePriceMax: 400000,
    });
    const errors = await validate(validDto);
    expect(errors.length).toBe(0);
    expect(validDto.basePriceMin).toBe(150000);
    expect(validDto.basePriceMax).toBe(400000);
  });

  it('validates UpdateServiceDto with basePriceMin and basePriceMax', async () => {
    const updateDto = plainToInstance(UpdateServiceDto, {
      basePriceMin: 200000,
      basePriceMax: 500000,
    });
    const errors = await validate(updateDto);
    expect(errors.length).toBe(0);
    expect(updateDto.basePriceMin).toBe(200000);
    expect(updateDto.basePriceMax).toBe(500000);
  });

  it('exposes basePriceMin and basePriceMax on ServiceResponseDto', () => {
    const response = plainToInstance(ServiceResponseDto, {
      id: '987e6543-e21b-12d3-a456-426614174000',
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      basePriceMin: 150000,
      basePriceMax: 400000,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(response.basePriceMin).toBe(150000);
    expect(response.basePriceMax).toBe(400000);
  });

  it('ServicesService.create persists basePriceMin and basePriceMax', async () => {
    const mockPrisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cat-1', name: 'Điện lạnh' }),
      },
      service: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => {
        return cb({
          service: {
            create: vi.fn().mockImplementation(({ data }) => Promise.resolve({
              id: 'svc-1',
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            })),
          },
          outboxEvent: {
            create: vi.fn().mockResolvedValue({}),
          },
        });
      }),
    };

    const mockOutbox = {
      publish: vi.fn().mockResolvedValue(undefined),
      triggerPublish: vi.fn().mockResolvedValue(undefined),
    };
    const mockRedis = {
      delByPattern: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ServicesService(
      mockPrisma as any,
      mockOutbox as any,
      mockRedis as any,
    );

    const result = await service.create({
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      basePriceMin: 150000,
      basePriceMax: 400000,
    } as any);

    expect(result).toBeDefined();
    expect((result as any).basePriceMin).toBe(150000);
    expect((result as any).basePriceMax).toBe(400000);
  });

  it('rejects CreateServiceDto when min > max', async () => {
    const invalidDto = plainToInstance(CreateServiceDto, {
      categoryId: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      basePriceMin: 500000,
      basePriceMax: 300000,
    });
    const errors = await validate(invalidDto);
    expect(errors.length).toBeGreaterThan(0);
    const messages = errors.flatMap((e) => Object.values(e.constraints || {}));
    expect(
      messages.some((m) => m.includes('basePriceMin must be strictly less than basePriceMax')),
    ).toBe(true);
  });

  it('rejects CreateServiceDto when min == max', async () => {
    const invalidDto = plainToInstance(CreateServiceDto, {
      categoryId: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      basePriceMin: 300000,
      basePriceMax: 300000,
    });
    const errors = await validate(invalidDto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows CreateServiceDto when only one bound is provided', async () => {
    const validDto = plainToInstance(CreateServiceDto, {
      categoryId: '123e4567-e89b-42d3-a456-426614174000',
      name: 'Sửa máy lạnh',
      basePriceMin: 150000,
    });
    const errors = await validate(validDto);
    expect(errors.length).toBe(0);
  });

  it('ServicesService.create rejects min >= max with BadRequestException', async () => {
    const mockPrisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cat-1', name: 'Điện lạnh' }),
      },
      service: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new ServicesService(
      mockPrisma as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.create({
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Sửa máy lạnh',
        basePriceMin: 400000,
        basePriceMax: 200000,
      } as any),
    ).rejects.toThrow('basePriceMin must be strictly less than basePriceMax');
  });

  it('ServicesService.update validates single field PATCH against existing database prices', async () => {
    const mockPrisma = {
      service: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'svc-1',
          categoryId: 'cat-1',
          name: 'Sửa máy lạnh',
          basePriceMin: 150000,
          basePriceMax: 400000,
        }),
        update: vi.fn(),
      },
      category: {
        findUnique: vi.fn(),
      },
    };
    const service = new ServicesService(
      mockPrisma as any,
      {} as any,
      {} as any,
    );

    // Try to update basePriceMin to 500000 when DB basePriceMax is 400000
    await expect(
      service.update('svc-1', {
        basePriceMin: 500000,
      }),
    ).rejects.toThrow('basePriceMin must be strictly less than basePriceMax');

    // Try to update basePriceMax to 100000 when DB basePriceMin is 150000
    await expect(
      service.update('svc-1', {
        basePriceMax: 100000,
      }),
    ).rejects.toThrow('basePriceMin must be strictly less than basePriceMax');
  });
});
