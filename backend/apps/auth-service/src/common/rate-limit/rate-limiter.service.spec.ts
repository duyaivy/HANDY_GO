import { describe, expect, it, beforeEach } from 'vitest';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AppException, ERROR_CODES } from '@app/common';
import { RateLimiterService } from './rate-limiter.service.js';
import {
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../constants/auth.constants.js';

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

  describe('failed logins tracking', () => {
    const phone = '+84912345678';

    it('should not throw if failed attempts are below limit', async () => {
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS - 1; i++) {
        await service.recordFailedLogin(phone);
      }

      await expect(service.checkFailedLogins(phone)).resolves.toBeUndefined();
    });

    it('should throw 429 when failed attempts reach MAX_FAILED_LOGIN_ATTEMPTS', async () => {
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
        await service.recordFailedLogin(phone);
      }

      try {
        await service.checkFailedLogins(phone);
        expect.unreachable('Should have thrown 429');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        const appErr = err as AppException;
        expect(appErr.getStatus()).toBe(429);
        const response = appErr.getResponse() as any;
        expect(response.code).toBe(ERROR_CODES.RATE_LIMITED);
        expect(response.message).toContain(
          `Bạn đã nhập sai mật khẩu quá ${MAX_FAILED_LOGIN_ATTEMPTS} lần`,
        );
        expect(response.details).toHaveProperty('retryAfterSeconds');
      }
    });

    it('should reset failed logins after successful authentication', async () => {
      for (let i = 0; i < MAX_FAILED_LOGIN_ATTEMPTS; i++) {
        await service.recordFailedLogin(phone);
      }

      await service.resetFailedLogins(phone);

      await expect(service.checkFailedLogins(phone)).resolves.toBeUndefined();
    });
  });

  describe('cleanupExpiredRecords', () => {
    it('should run cleanup without error', async () => {
      const count = await service.cleanupExpiredRecords();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('onModuleDestroy', () => {
    it('should shutdown storage cleanly', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
