import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@app/config';
import { vi } from 'vitest';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  let clientMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            redisHost: 'localhost',
            redisPort: 6379,
            redisUrl: 'redis://localhost:6379',
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    clientMock = {
      llen: vi.fn().mockResolvedValue(5),
      zadd: vi.fn().mockResolvedValue(1),
      zrem: vi.fn().mockResolvedValue(1),
      zrange: vi.fn().mockResolvedValue(['order-1', '1000', 'order-2', '2000']),
      publish: vi.fn().mockResolvedValue(1),
      eval: vi.fn().mockResolvedValue(1),
    };
    (service as any).client = clientMock;
    (service as any).isConnected = true;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get list length via getListLength', async () => {
    const len = await service.getListLength('test:list');
    expect(len).toBe(5);
    expect(clientMock.llen).toHaveBeenCalledWith('test:list');
  });

  it('should add to sorted set with NX option via addToSortedSet', async () => {
    await service.addToSortedSet('test:zset', 'order-123', 123456789);
    expect(clientMock.zadd).toHaveBeenCalledWith('test:zset', 'NX', 123456789, 'order-123');
  });

  it('should remove member from sorted set via removeFromSortedSet', async () => {
    await service.removeFromSortedSet('test:zset', 'order-123');
    expect(clientMock.zrem).toHaveBeenCalledWith('test:zset', 'order-123');
  });

  it('should parse range and scores via getSortedSetRangeWithScores', async () => {
    const results = await service.getSortedSetRangeWithScores('test:zset');
    expect(clientMock.zrange).toHaveBeenCalledWith('test:zset', 0, '-1', 'WITHSCORES');
    expect(results).toEqual([
      { member: 'order-1', score: 1000 },
      { member: 'order-2', score: 2000 },
    ]);
  });

  it('should atomically append to list and track in sorted set index via appendAndTrackPendingOrder', async () => {
    const listKey = 'tracking:{pending}:order_events:ord-1';
    const indexKey = 'tracking:{pending}:orders_index';
    const value = { data: 'test-event' };
    const member = 'ord-1';
    const score = 1700000000000;

    await service.appendAndTrackPendingOrder(listKey, indexKey, value, member, score);

    expect(clientMock.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('RPUSH'"),
      2,
      listKey,
      indexKey,
      JSON.stringify(value),
      member,
      String(score),
    );
  });

  it('should throw TypeError from appendAndTrackPendingOrder if value is not serializable', async () => {
    const listKey = 'tracking:{pending}:order_events:ord-1';
    const indexKey = 'tracking:{pending}:orders_index';

    await expect(
      service.appendAndTrackPendingOrder(listKey, indexKey, undefined, 'ord-1'),
    ).rejects.toThrow(TypeError);
  });

  it('should atomically cleanup pending order index if empty via cleanupPendingOrderIfEmpty', async () => {
    const listKey = 'tracking:{pending}:order_events:ord-1';
    const lockKey = 'tracking:{pending}:order_events_lock:ord-1';
    const indexKey = 'tracking:{pending}:orders_index';
    const lockToken = 'tok-123';
    const member = 'ord-1';

    clientMock.eval.mockResolvedValueOnce(0);
    const resultEmpty = await service.cleanupPendingOrderIfEmpty(
      listKey,
      lockKey,
      indexKey,
      lockToken,
      member,
    );
    expect(resultEmpty).toBe(0);
    expect(clientMock.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET', KEYS[2])"),
      3,
      listKey,
      lockKey,
      indexKey,
      lockToken,
      member,
    );

    // When list still has items
    clientMock.eval.mockResolvedValueOnce(3);
    const resultRemaining = await service.cleanupPendingOrderIfEmpty(
      listKey,
      lockKey,
      indexKey,
      lockToken,
      member,
    );
    expect(resultRemaining).toBe(3);

    // When lock was lost
    clientMock.eval.mockResolvedValueOnce(-1);
    const resultLockLost = await service.cleanupPendingOrderIfEmpty(
      listKey,
      lockKey,
      indexKey,
      lockToken,
      member,
    );
    expect(resultLockLost).toBe(-1);
  });

  it('should publishStrict and return recipient count', async () => {
    const count = await service.publishStrict('test:chan', { hello: 'world' });
    expect(count).toBe(1);
    expect(clientMock.publish).toHaveBeenCalledWith(
      'test:chan',
      JSON.stringify({ hello: 'world' }),
    );
  });

  it('should throw from publishStrict if client.publish throws', async () => {
    clientMock.publish.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(
      service.publishStrict('test:chan', { hello: 'world' }),
    ).rejects.toThrow('Connection lost');
  });

  it('should throw if not connected', async () => {
    (service as any).isConnected = false;
    await expect(service.getListLength('test:list')).rejects.toThrow('Redis is not connected');
    await expect(
      service.publishStrict('test:chan', { hello: 'world' }),
    ).rejects.toThrow('Redis is not connected');
  });
});
