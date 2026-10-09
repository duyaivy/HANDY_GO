import {
  Inject,
  Injectable,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  ThrottlerStorageService,
  getStorageToken,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { AppException, ERROR_CODES } from '@app/common';

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
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
   * Check and increment the hit count for a given key using standard ThrottlerStorage API.
   * Fully compliant with SOLID: SRP (only rate limiting), LSP & DIP (works with any ThrottlerStorage implementation).
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
        data: { retryAfterSeconds },
      });
    }
  }
}
