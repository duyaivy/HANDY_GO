import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConsumedEventRepository } from './consumed-event.repository.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('ConsumedEventRepository', () => {
  let repository: ConsumedEventRepository;
  let prismaMock: {
    consumedEvent: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prismaMock = {
      consumedEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };
    repository = new ConsumedEventRepository(prismaMock as unknown as PrismaService);
  });

  describe('isEventConsumed', () => {
    it('should return true if event is found', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue({ eventId: 'evt-123' });

      const result = await repository.isEventConsumed('evt-123');

      expect(result).toBe(true);
      expect(prismaMock.consumedEvent.findUnique).toHaveBeenCalledWith({
        where: { eventId: 'evt-123' },
        select: { eventId: true },
      });
    });

    it('should return false if event is not found', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);

      const result = await repository.isEventConsumed('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('markEventConsumed', () => {
    it('should insert a consumed event record', async () => {
      prismaMock.consumedEvent.create.mockResolvedValue({});

      await repository.markEventConsumed('evt-123', 'payment.succeeded');

      expect(prismaMock.consumedEvent.create).toHaveBeenCalledWith({
        data: {
          eventId: 'evt-123',
          eventType: 'payment.succeeded',
        },
      });
    });
  });

  describe('recordEventIfNew', () => {
    it('should return true when event is newly inserted', async () => {
      prismaMock.consumedEvent.create.mockResolvedValue({
        eventId: 'evt-123',
        eventType: 'payment.succeeded',
      });

      const result = await repository.recordEventIfNew('evt-123', 'payment.succeeded');

      expect(result).toBe(true);
      expect(prismaMock.consumedEvent.create).toHaveBeenCalledWith({
        data: {
          eventId: 'evt-123',
          eventType: 'payment.succeeded',
        },
      });
    });

    it('should return false on unique constraint violation (P2002)', async () => {
      const error = new Error('Unique constraint violation');
      (error as any).code = 'P2002';
      prismaMock.consumedEvent.create.mockRejectedValue(error);

      const result = await repository.recordEventIfNew('evt-duplicate', 'payment.succeeded');

      expect(result).toBe(false);
    });

    it('should rethrow unexpected errors', async () => {
      const dbError = new Error('Database connection failed');
      prismaMock.consumedEvent.create.mockRejectedValue(dbError);

      await expect(
        repository.recordEventIfNew('evt-err', 'payment.succeeded'),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('deleteEvent', () => {
    it('should delete consumed event by eventId', async () => {
      prismaMock.consumedEvent.deleteMany.mockResolvedValue({ count: 1 });

      await repository.deleteEvent('evt-123');

      expect(prismaMock.consumedEvent.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-123' },
      });
    });
  });
});
