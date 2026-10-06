import { describe, expect, it, beforeEach } from 'vitest';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AppException, ERROR_CODES } from '@app/common';
import { RateLimiterService } from './rate-limiter.service.js';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let storage: ThrottlerStorageService;

  beforeEach(() => {
    storage = new ThrottlerStorageService();
    service = new RateLimiterService(storage);
  });

  describe('checkAndIncrement', () => {
    it('should allow requests within the limit', async () => {
      await expect(
        service.checkAndIncrement('test-key', 5, 60),
      ).resolves.toBeUndefined();

      await expect(
        service.checkAndIncrement('test-key', 5, 60),
      ).resolves.toBeUndefined();
    });

    it('should throw 429 when points exceed the limit', async () => {
      const key = 'test-exceed-key';
      const limit = 2;

      await service.checkAndIncrement(key, limit, 60);
      await service.checkAndIncrement(key, limit, 60);

      try {
        await service.checkAndIncrement(key, limit, 60, 'Custom limit message');
        expect.unreachable('Should have thrown 429 AppException');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        const appErr = err as AppException;
        expect(appErr.getStatus()).toBe(429);
        const response = appErr.getResponse() as any;
        expect(response.code).toBe(ERROR_CODES.RATE_LIMITED);
        expect(response.message).toBe('Custom limit message');
        expect(response.details).toHaveProperty('retryAfterSeconds');
      }
    });

    it('should track different keys independently', async () => {
      await service.checkAndIncrement('key-1', 1, 60);
      await expect(
        service.checkAndIncrement('key-2', 1, 60),
      ).resolves.toBeUndefined();
    });
  });

  describe('onModuleDestroy', () => {
    it('should shutdown storage cleanly', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
