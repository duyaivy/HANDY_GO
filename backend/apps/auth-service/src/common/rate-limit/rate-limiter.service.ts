import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  ThrottlerStorageService,
  getStorageToken,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { AppException, ERROR_CODES } from '@app/common';
import {
  FAILED_LOGIN_LOCKOUT_SECONDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../constants/auth.constants.js';

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly storage: ThrottlerStorage;

  constructor(
    @Optional()
    @Inject(getStorageToken())
    storage?: ThrottlerStorage,
  ) {
    this.storage =
      storage && typeof storage.increment === 'function'
        ? storage
        : new ThrottlerStorageService();
  }

  onModuleDestroy(): void {
    if (this.storage instanceof ThrottlerStorageService) {
      this.storage.onApplicationShutdown();
    }
  }

  /**
   * Periodic cleanup job for expired rate limit records using ThrottlerStorageService.
   */
  async cleanupExpiredRecords(): Promise<number> {
    try {
      if (this.storage instanceof ThrottlerStorageService) {
        const before = this.storage.storage.size;
        (this.storage as any).evictIdleRecords?.();
        const after = this.storage.storage.size;
        const count = Math.max(0, before - after);
        if (count > 0) {
          this.logger.debug(`Cleaned up ${count} expired rate limit records`);
        }
        return count;
      }
      return 0;
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to cleanup expired rate limits: ${(err as Error)?.message}`,
      );
      return 0;
    }
  }

  /**
   * Check and increment the hit count for a given key using @nestjs/throttler storage.
   */
  async checkAndIncrement(
    key: string,
    limit: number,
    windowSeconds: number,
    errorMessage = 'Bạn đã vượt quá giới hạn yêu cầu. Vui lòng thử lại sau.',
  ): Promise<void> {
    const ttlMs = windowSeconds * 1000;
    const throttlerName = 'default';

    const record = await this.storage.increment(
      key,
      ttlMs,
      limit,
      ttlMs,
      throttlerName,
    );

    if (record.isBlocked || record.totalHits > limit) {
      const retryAfterSeconds = Math.max(
        1,
        record.timeToBlockExpire > 0
          ? record.timeToBlockExpire
          : record.timeToExpire,
      );
      throw new AppException(429, ERROR_CODES.RATE_LIMITED, errorMessage, {
        details: { retryAfterSeconds },
      });
    }
  }

  /**
   * Check if a phone number is currently locked out due to exceeding MAX_FAILED_LOGIN_ATTEMPTS.
   */
  async checkFailedLogins(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    const record = this.getStorageRecord(key, 'failed-login');
    if (!record) return;

    const now = Date.now();
    const isBlocked =
      record.isBlocked || record.totalHits >= MAX_FAILED_LOGIN_ATTEMPTS;
    const expireTime = Math.max(record.blockExpiresAt, record.expiresAt);

    if (isBlocked && expireTime > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((expireTime - now) / 1000),
      );
      throw new AppException(
        429,
        ERROR_CODES.RATE_LIMITED,
        `Bạn đã nhập sai mật khẩu quá ${MAX_FAILED_LOGIN_ATTEMPTS} lần. Vui lòng thử lại sau ${Math.ceil(
          retryAfterSeconds / 60,
        )} phút.`,
        { details: { retryAfterSeconds } },
      );
    }
  }

  /**
   * Record a failed login attempt for a phone number using @nestjs/throttler storage.
   */
  async recordFailedLogin(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    const ttlMs = FAILED_LOGIN_LOCKOUT_SECONDS * 1000;
    await this.storage.increment(
      key,
      ttlMs,
      MAX_FAILED_LOGIN_ATTEMPTS,
      ttlMs,
      'failed-login',
    );
  }

  /**
   * Reset the failed login counter for a phone number.
   */
  async resetFailedLogins(phone: string): Promise<void> {
    const key = `login_fail:phone:${phone}`;
    if (this.storage instanceof ThrottlerStorageService) {
      this.storage.storage.delete(key);
      (this.storage as any).hitExpirations?.delete(key);
    }
  }

  private getStorageRecord(
    key: string,
    throttlerName: string,
  ): {
    totalHits: number;
    expiresAt: number;
    blockExpiresAt: number;
    isBlocked: boolean;
  } | undefined {
    if (this.storage instanceof ThrottlerStorageService) {
      const record = this.storage.storage.get(key);
      if (!record) return undefined;
      const totalHits =
        record.totalHits instanceof Map
          ? (record.totalHits.get(throttlerName) ?? 0)
          : 0;
      return {
        totalHits,
        expiresAt: record.expiresAt || 0,
        blockExpiresAt: record.blockExpiresAt || 0,
        isBlocked: record.isBlocked || false,
      };
    }
    return undefined;
  }
}
