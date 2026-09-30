import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AuthPrismaService } from '@app/database';
import { AppException } from '@app/common';
import { RateLimiterService } from './rate-limiter.service.js';
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../auth.constants.js';


describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let dbMock: any;

  beforeEach(() => {
    dbMock = {
      rateLimit: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: vi.fn(),
    };
    service = new RateLimiterService(dbMock as unknown as AuthPrismaService);
  });

  describe('checkAndIncrement (atomic)', () => {
    it('should increment atomically via raw query when available', async () => {
      dbMock.$queryRaw.mockResolvedValueOnce([
        { points: 1, expireAt: new Date(Date.now() + 60000) },
      ]);

      await expect(
        service.checkAndIncrement('test-key', 5, 60),
      ).resolves.toBeUndefined();

      expect(dbMock.$queryRaw).toHaveBeenCalled();
    });

    it('should throw 429 when points exceed the limit', async () => {
      dbMock.$queryRaw.mockResolvedValueOnce([
        { points: 6, expireAt: new Date(Date.now() + 30000) },
      ]);

      await expect(
        service.checkAndIncrement('test-key', 5, 60, 'Rate limit exceeded'),
      ).rejects.toThrow(AppException);
    });

    it('should fallback to upsert when raw query fails', async () => {
      dbMock.$queryRaw.mockRejectedValueOnce(new Error('raw query not supported'));
      dbMock.rateLimit.findUnique.mockResolvedValueOnce(null);
      dbMock.rateLimit.upsert.mockResolvedValueOnce({
        points: 1,
        expireAt: new Date(Date.now() + 60000),
      });

      await expect(
        service.checkAndIncrement('test-key', 5, 60),
      ).resolves.toBeUndefined();

      expect(dbMock.rateLimit.upsert).toHaveBeenCalled();
    });
  });

  describe('failed logins tracking', () => {
    it('should not throw if failed attempts are below limit', async () => {
      dbMock.rateLimit.findUnique.mockResolvedValueOnce({
        key: 'login_fail:phone:+84912345678',
        points: 3,
        expireAt: new Date(Date.now() + 60000),
      });

      await expect(
        service.checkFailedLogins('+84912345678'),
      ).resolves.toBeUndefined();
    });

    it('should throw 429 when failed attempts reach MAX_FAILED_LOGIN_ATTEMPTS', async () => {
      dbMock.rateLimit.findUnique.mockResolvedValueOnce({
        key: 'login_fail:phone:+84912345678',
        points: MAX_FAILED_LOGIN_ATTEMPTS,
        expireAt: new Date(Date.now() + 60000),
      });

      await expect(
        service.checkFailedLogins('+84912345678'),
      ).rejects.toThrow(AppException);
    });

    it('should reset failed logins by deleting key', async () => {
      await service.resetFailedLogins('+84912345678');
      expect(dbMock.rateLimit.deleteMany).toHaveBeenCalledWith({
        where: { key: 'login_fail:phone:+84912345678' },
      });
    });
  });

  describe('cleanupExpiredRecords', () => {
    it('should delete expired rate limit records', async () => {
      dbMock.rateLimit.deleteMany.mockResolvedValueOnce({ count: 5 });
      const count = await service.cleanupExpiredRecords();
      expect(count).toBe(5);
      expect(dbMock.rateLimit.deleteMany).toHaveBeenCalledWith({
        where: { expireAt: { lte: expect.any(Date) } },
      });
    });
  });
});
