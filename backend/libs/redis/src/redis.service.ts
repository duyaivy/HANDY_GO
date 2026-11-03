import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

  async appendListItem(key: string, value: unknown): Promise<void> {
    this.assertConnected();
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new TypeError(`Value for Redis list "${key}" is not serializable`);
    }
    await this.client.rpush(key, serialized);
  }

  async peekListHead<T>(
    key: string,
  ): Promise<{ value: T; serialized: string } | null> {
    this.assertConnected();
    const serialized = await this.client.lindex(key, 0);
    if (serialized === null) {
      return null;
    }
    return { value: JSON.parse(serialized) as T, serialized };
  }

  async acknowledgeListHead(
    key: string,
    serialized: string,
    lockKey: string,
    lockToken: string,
  ): Promise<boolean> {
    this.assertConnected();
    const result = await this.client.eval(
      'if redis.call("GET", KEYS[2]) == ARGV[2] and redis.call("LINDEX", KEYS[1], 0) == ARGV[1] then redis.call("LPOP", KEYS[1]); return 1 else return 0 end',
      2,
      key,
      lockKey,
      serialized,
      lockToken,
    );
    return Number(result) === 1;
  }

  async getListLength(key: string): Promise<number> {
    this.assertConnected();
    return await this.client.llen(key);
  }

  async addToSortedSet(
    key: string,
    member: string,
    score: number,
  ): Promise<void> {
    this.assertConnected();
    await this.client.zadd(key, 'NX', score, member);
  }

  async removeFromSortedSet(key: string, member: string): Promise<void> {
    this.assertConnected();
    await this.client.zrem(key, member);
  }

  async getSortedSetRangeWithScores(
    key: string,
    start = 0,
    stop = -1,
  ): Promise<Array<{ member: string; score: number }>> {
    this.assertConnected();
    const results = (await this.client.zrange(key, start, String(stop), 'WITHSCORES')) as string[];
    const items: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < results.length; i += 2) {
      items.push({
        member: results[i],
        score: Number(results[i + 1]),
      });
    }
    return items;
  }

  async withDistributedLock(
    key: string,
    callback: (
      isLockOwner: () => boolean,
      lockToken: string,
    ) => Promise<void>,
    ttlMs = 30_000,
  ): Promise<boolean> {
    this.assertConnected();
    const token = randomUUID();
    const acquired = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') {
      return false;
    }

    let lockOwned = true;
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing || !lockOwned) {
        return;
      }
      renewing = true;
      void this.client
        .eval(
          'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) else return 0 end',
          1,
          key,
          token,
          String(ttlMs),
        )
        .then((result) => {
          if (Number(result) !== 1) {
            lockOwned = false;
          }
        })
        .catch((error: Error) => {
          lockOwned = false;
          this.logger.warn(
            `Redis lock renewal error for key "${key}": ${error.message}`,
          );
        })
        .finally(() => {
          renewing = false;
        });
    }, Math.max(1, Math.floor(ttlMs / 3)));
    heartbeat.unref();

    try {
      await callback(() => lockOwned, token);
    } finally {
      clearInterval(heartbeat);
      try {
        await this.client.eval(
          'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
          1,
          key,
          token,
        );
      } catch (error) {
        this.logger.warn(
          `Redis lock release error for key "${key}": ${(error as Error).message}`,
        );
      }
    }

    return true;
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

  /**
   * Publishes a message to a channel with strict error propagation.
   * Throws an error if Redis is disconnected or if the publish command fails.
   */
  async publishStrict(channel: string, message: unknown): Promise<number> {
    this.assertConnected();
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    return await this.client.publish(channel, payload);
  }

  private assertConnected(): void {
    if (!this.isConnected) {
      throw new Error('Redis is not connected');
    }
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void,
    onReconnect?: () => void,
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

    let reconnectListener: (() => void) | undefined;
    if (onReconnect) {
      reconnectListener = () => {
        this.logger.log(`Redis subscriber reconnected on channel "${channel}"`);
        onReconnect();
      };
      this.subClient.on('ready', reconnectListener);
    }

    return async () => {
      if (this.subClient) {
        this.subClient.off('message', listener);
        if (reconnectListener) {
          this.subClient.off('ready', reconnectListener);
        }
        await this.subClient.unsubscribe(channel).catch(() => {});
      }
    };
  }
}
