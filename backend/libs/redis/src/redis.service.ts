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

  private subClient?: Redis;

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
    if (this.subClient) {
      await this.subClient.quit().catch(() => {});
    }
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

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis expire error for key "${key}": ${(error as Error).message}`);
    }
  }

  async rpush(key: string, value: unknown): Promise<void> {
    if (!this.isConnected) return;
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.rpush(key, serialized);
    } catch (error) {
      this.logger.warn(`Redis rpush error for key "${key}": ${(error as Error).message}`);
    }
  }

  async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
    if (!this.isConnected) return [];
    try {
      const items = await this.client.lrange(key, start, stop);
      return items.map((item) => {
        try {
          return JSON.parse(item) as T;
        } catch {
          return item as unknown as T;
        }
      });
    } catch (error) {
      this.logger.warn(`Redis lrange error for key "${key}": ${(error as Error).message}`);
      return [];
    }
  }

  async publish(channel: string, message: unknown): Promise<void> {
    if (!this.isConnected) return;
    try {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      await this.client.publish(channel, payload);
    } catch (error) {
      this.logger.warn(`Redis publish error on channel "${channel}": ${(error as Error).message}`);
    }
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<() => Promise<void>> {
    const redisUrl = this.config.redisUrl;
    if (!this.subClient) {
      this.subClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
      await this.subClient.connect().catch((err) => {
        this.logger.warn(`Could not connect Redis subscriber: ${(err as Error).message}`);
      });
    }

    try {
      await this.subClient.subscribe(channel);
    } catch (err: any) {
      this.logger.warn(`Could not subscribe to channel "${channel}": ${err.message}`);
    }

    const listener = (chan: string, msg: string) => {
      if (chan === channel) {
        callback(msg);
      }
    };
    this.subClient.on('message', listener);

    return async () => {
      if (this.subClient) {
        this.subClient.off('message', listener);
        await this.subClient.unsubscribe(channel).catch(() => {});
      }
    };
  }
}
