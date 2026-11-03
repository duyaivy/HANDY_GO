import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import amqp from 'amqp-connection-manager';
import { SseEventBridgeService } from '../src/sse/sse-event-bridge.service.js';
import { SseService } from '../src/sse/sse.service.js';

vi.mock('amqp-connection-manager', () => ({ default: { connect: vi.fn() } }));

describe('SSE broker consumer recovery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function fixture() {
    vi.stubEnv('RABBITMQ_URL', 'amqp://test');
    const wrapper = Object.assign(new EventEmitter(), {
      close: vi.fn(async () => {}),
    });
    let setup!: (channel: any) => Promise<void>;
    const manager = Object.assign(new EventEmitter(), {
      close: vi.fn(async () => {}),
      createChannel: vi.fn((options: any) => {
        setup = options.setup;
        return wrapper;
      }),
    });
    vi.mocked(amqp.connect).mockReturnValue(manager as any);
    const hub = new SseService();
    const frames: string[] = [];
    const response = {
      writeHead: vi.fn(),
      flushHeaders: vi.fn(),
      on: vi.fn(),
      end: vi.fn(),
      write: vi.fn((frame: string) => {
        frames.push(frame);
        return true;
      }),
    };
    hub.registerClient({
      id: 'socket',
      requestId: 'request',
      userId: 'customer',
      roles: ['customer'],
      connectedAt: new Date(),
      res: response as any,
    });
    frames.length = 0;
    const bridge = new SseEventBridgeService(hub, {
      get: () => 'amqp://test',
    } as any);
    const channel = () =>
      Object.assign(new EventEmitter(), {
        assertExchange: vi.fn(async () => {}),
        assertQueue: vi.fn(async () => ({ queue: 'exclusive' })),
        bindQueue: vi.fn(async () => {}),
        consume: vi.fn(async (_q: string, _handler: any) => ({})),
        close: vi.fn(async () => {}),
      });
    return {
      hub,
      bridge,
      frames,
      manager,
      wrapper,
      setup: (c: any) => setup(c),
      channel,
      response,
    };
  }

  it('keeps HTTP alive through outage and reconciles only after recovered consume-ok without another business event', async () => {
    const f = fixture();
    try {
      await f.bridge.onModuleInit();
      f.manager.emit('connect');
      expect(f.bridge.isBridgeDegraded).toBe(true);
      await f.setup(f.channel());
      expect(f.bridge.isBridgeDegraded).toBe(false);
      f.frames.length = 0;
      f.manager.emit('disconnect', { err: new Error('offline') });
      f.hub.broadcastHeartbeat();
      expect(f.frames[0]).toContain(':keepalive');
      expect(f.response.end).not.toHaveBeenCalled();
      // The REST database can change while no fanout message is delivered.
      f.manager.emit('connect');
      expect(f.bridge.isBridgeDegraded).toBe(true);
      const recovered = f.channel();
      let finishConsume!: () => void;
      recovered.consume.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishConsume = () => resolve({});
          }),
      );
      const pending = f.setup(recovered);
      await vi.waitFor(() => expect(recovered.consume).toHaveBeenCalled());
      expect(f.bridge.isBridgeDegraded).toBe(true);
      expect(f.frames.some((frame) => frame.includes('sync.required'))).toBe(
        false,
      );
      finishConsume();
      await pending;
      expect(f.bridge.isBridgeDegraded).toBe(false);
      const sync = f.frames.find((frame) => frame.includes('sync.required'))!;
      expect(JSON.parse(sync.split('data: ')[1])).toEqual({
        requestId: 'request',
        reason: 'bridge.ready',
        eventId: expect.any(String),
        occurredAt: expect.any(String),
      });
      expect(f.hub.getClientCount()).toBe(1);
      for (let i = 0; i < 3; i++) {
        f.manager.emit('disconnect', { err: new Error('offline') });
        await f.setup(f.channel());
      }
      expect(
        f.frames.filter((frame) => frame.includes('sync.required')),
      ).toHaveLength(4);
      expect(f.manager.createChannel).toHaveBeenCalledOnce();
      expect(f.hub.getClientCount()).toBe(1);
    } finally {
      await f.bridge.onModuleDestroy();
      f.hub.onModuleDestroy();
    }
  });

  it('remains degraded on setup failure, channel close, or broker consumer cancellation', async () => {
    const f = fixture();
    try {
      await f.bridge.onModuleInit();
      const failed = f.channel();
      failed.bindQueue.mockRejectedValueOnce(new Error('binding failed'));
      await expect(f.setup(failed)).rejects.toThrow('binding failed');
      f.wrapper.emit('error', new Error('binding failed'));
      expect(f.bridge.isBridgeDegraded).toBe(true);
      expect(f.frames).toEqual([]);
      const good = f.channel();
      await f.setup(good);
      good.emit('close');
      expect(f.bridge.isBridgeDegraded).toBe(true);
      const next = f.channel();
      await f.setup(next);
      next.consume.mock.calls[0][1](null);
      expect(f.bridge.isBridgeDegraded).toBe(true);
      expect(next.close).toHaveBeenCalledOnce();
    } finally {
      await f.bridge.onModuleDestroy();
      f.hub.onModuleDestroy();
    }
  });

  it('does not mark an interrupted or destroyed setup healthy when consume resolves late', async () => {
    const f = fixture();
    try {
      await f.bridge.onModuleInit();
      const channel = f.channel();
      let resolve!: () => void;
      channel.consume.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = () => done({});
          }),
      );
      const pending = f.setup(channel);
      await vi.waitFor(() => expect(channel.consume).toHaveBeenCalled());
      f.manager.emit('disconnect', { err: new Error('offline') });
      await f.bridge.onModuleDestroy();
      resolve();
      await pending;
      expect(f.bridge.isBridgeDegraded).toBe(true);
      expect(f.frames).toEqual([]);
    } finally {
      f.hub.onModuleDestroy();
    }
  });
});
