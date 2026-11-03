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
