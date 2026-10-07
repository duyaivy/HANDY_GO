import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const redisUrl = this.config.redisUrl;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Successfully connected to Redis');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      this.logger.warn(`Redis client error: ${err.message}`);
    });

    this.client.connect().catch((err) => {
      this.logger.warn(`Could not connect to Redis: ${(err as Error).message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.logger.log('Disconnected from Redis');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.warn(`Redis get error for key "${key}": ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      this.logger.warn(`Redis set error for key "${key}": ${(error as Error).message}`);
    }
  }

  async del(key: string | string[]): Promise<void> {
    if (!this.isConnected) return;
    try {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.warn(`Redis del error: ${(error as Error).message}`);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const stream = this.client.scanStream({
        match: pattern,
        count: 100,
      });

      const keysToDelete: string[] = [];
      for await (const resultKeys of stream) {
        if (resultKeys.length > 0) {
          keysToDelete.push(...resultKeys);
        }
      }

      if (keysToDelete.length > 0) {
        await this.client.del(...keysToDelete);
      }
    } catch (error) {
      this.logger.warn(`Redis delByPattern error for pattern "${pattern}": ${(error as Error).message}`);
    }
  }
}
