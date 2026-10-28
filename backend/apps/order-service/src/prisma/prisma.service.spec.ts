import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
  });

  it('should initialize with order_service schema', () => {
    expect(service.schema).toBe('order_service');
  });

  it('should disconnect on onModuleDestroy', async () => {
    const disconnectSpy = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined as any);
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
