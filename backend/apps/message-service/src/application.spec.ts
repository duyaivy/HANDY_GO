import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestApplication } from '@nestjs/core/nest-application.js';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessageApp } from './application.js';
import { AuthorityClient } from './authority.js';
import { MessageBroker } from './broker.js';
import { IdentityService } from './identity.js';
import { MessageService } from './message.service.js';
import { MessagePrisma } from './persistence.js';
import { MessageRealtime } from './realtime.js';
import { CursorCodec, RateLimits } from './security.js';
import type { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';

// Database/broker failures are external seams. Nest, HTTP and Socket.IO remain real.
function options() {
  const state = { disconnected: false, queries: 0 };
  const db = {
    async $disconnect() {
      state.disconnected = true;
    },
    async $queryRaw() {
      state.queries++;
      return [{ value: 1 }];
    },
  } as unknown as MessagePrisma;
  const authority = new AuthorityClient({
    secret: 'test',
    bidding: 'http://bidding.test',
    order: 'http://order.test',
    auth: 'http://auth.test',
    media: 'http://media.test',
  });
  const verifier = {} as TokenVerifierService;
  return {
    db,
    authority,
    verifier,
    cursorSecret: 's'.repeat(32),
    origins: [],
    state,
  };
}

const apps: NestExpressApplication[] = [];
beforeEach(() => {
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close().catch(() => {});
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Message Nest composition and lifecycle', () => {
  // Catches an absent reusable module or factories resolving different dependency instances.
  it('exports a registered module with resolvable domain providers and HTTP routes', async () => {
    const module = await import('./message.module.js').catch(() => undefined);
    expect(module?.MessageModule).toBeDefined();
    const config = options();
    const app = await NestFactory.create<NestExpressApplication>(
      module!.MessageModule.register(config),
      { logger: false },
    );
    apps.push(app);
    expect(app.get(MessageService).db).toBe(config.db);
    expect(app.get(MessageService).authority).toBe(config.authority);
    expect(app.get(IdentityService)).toBeInstanceOf(IdentityService);
    expect(app.get(CursorCodec)).toBeInstanceOf(CursorCodec);
    expect(app.get(RateLimits)).toBeInstanceOf(RateLimits);
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/health`);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'message-service',
    });
    expect(config.state.queries).toBe(1);
    const handshake = await fetch(
      `${await app.getUrl()}/api/v1/chat/socket.io/?EIO=4&transport=polling`,
    );
    expect(handshake.status).toBe(200);
    expect(await handshake.text()).toMatch(/^0\{/);
    await app.close();
    expect(config.state.disconnected).toBe(true);
  });

  // Catches shared provider state/callbacks between independent applications.
  it('keeps rate limits and realtime callbacks separate for each application', async () => {
    const first = await createMessageApp(options());
    apps.push(first);
    const second = await createMessageApp(options());
    apps.push(second);
    first.get(RateLimits).take('same-user', 1, 60000);
    expect(() => first.get(RateLimits).take('same-user', 1, 60000)).toThrow(
      'RATE_LIMITED',
    );
    expect(() =>
      second.get(RateLimits).take('same-user', 1, 60000),
    ).not.toThrow();
    const secondCallback = second.get(MessageService).onMessage;
    expect(first.get(MessageService).onMessage).not.toBe(secondCallback);
    await first.close();
    expect(second.get(MessageService).onMessage).toBe(secondCallback);
    await expect(
      second
        .get(MessageService)
        .onRead({} as never, { customerId: 'c', workerId: 'w' } as never),
    ).resolves.toBeUndefined();
  });

  // Catches moving factory resource startup until listen, or starting twice at init.
  it('attaches realtime and starts an optional broker before factory return exactly once', async () => {
    let starts = 0;
    vi.spyOn(MessageBroker.prototype, 'start').mockImplementation(() => {
      starts++;
    });
    vi.spyOn(MessageBroker.prototype, 'close').mockResolvedValue();
    const app = await createMessageApp({
      ...options(),
      brokerUrl: 'amqp://broker.test',
    });
    apps.push(app);
    expect(starts).toBe(1);
    expect(app.getHttpServer().listenerCount('upgrade')).toBeGreaterThan(0);
    await app.init();
    expect(starts).toBe(1);
  });

  // Catches requiring broker configuration or losing pre-listen shutdown ownership.
  it('closes realtime and database before listen when the broker is omitted', async () => {
    const config = options();
    let realtimeClosed = false;
    const close = MessageRealtime.prototype.close;
    vi.spyOn(MessageRealtime.prototype, 'close').mockImplementation(
      async function (this: MessageRealtime) {
        await close.call(this);
        realtimeClosed = true;
      },
    );
    const app = await createMessageApp(config);
    apps.push(app);
    await app.close();
    expect(realtimeClosed).toBe(true);
    expect(config.state.disconnected).toBe(true);
  });

  // Catches broker failure skipping realtime/database, and throwing from a Nest hook
  // before the framework can release its HTTP server and signal listeners.
  it('attempts cleanup in order after broker close rejects and closes the HTTP listener', async () => {
    const config = options();
    const order: string[] = [];
    const close = MessageRealtime.prototype.close;
    vi.spyOn(MessageBroker.prototype, 'start').mockImplementation(() => {});
    vi.spyOn(MessageBroker.prototype, 'close').mockImplementation(async () => {
      order.push('broker');
      throw new Error('credentials must not be logged');
    });
    vi.spyOn(MessageRealtime.prototype, 'close').mockImplementation(
      async function (this: MessageRealtime) {
        await close.call(this);
        order.push('realtime');
      },
    );
    config.db.$disconnect = async () => {
      order.push('database');
      config.state.disconnected = true;
    };
    const errors: unknown[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((entry) => {
      errors.push(entry);
    });
    const app = await createMessageApp({
      ...config,
      brokerUrl: 'amqp://broker.test',
    });
    apps.push(app);
    await app.listen(0, '127.0.0.1');
    await app.close();
    expect(order).toEqual(['broker', 'realtime', 'database']);
    expect(app.getHttpServer().listening).toBe(false);
    expect(errors).toContainEqual({
      resource: 'broker',
      errorCode: 'MESSAGE_CLEANUP_FAILED',
    });
    expect(JSON.stringify(errors)).not.toContain('credentials');
  });

  // Catches a realtime cleanup rejection skipping database cleanup.
  it('disconnects the database after realtime cleanup rejects', async () => {
    const config = options();
    const close = MessageRealtime.prototype.close;
    vi.spyOn(MessageRealtime.prototype, 'close').mockImplementation(
      async function (this: MessageRealtime) {
        await close.call(this);
        throw new Error('socket failure');
      },
    );
    const app = await createMessageApp(config);
    apps.push(app);
    await app.close();
    expect(config.state.disconnected).toBe(true);
  });

  // Catches orphaned resources when a synchronous broker setup step throws.
  it('releases resources acquired before broker startup fails', async () => {
    const config = options();
    const failure = new Error('broker setup failure');
    let realtimeClosed = false;
    let brokerClosed = false;
    const close = MessageRealtime.prototype.close;
    vi.spyOn(MessageBroker.prototype, 'start').mockImplementation(() => {
      throw failure;
    });
    vi.spyOn(MessageBroker.prototype, 'close').mockImplementation(async () => {
      brokerClosed = true;
    });
    vi.spyOn(MessageRealtime.prototype, 'close').mockImplementation(
      async function (this: MessageRealtime) {
        await close.call(this);
        realtimeClosed = true;
      },
    );
    await expect(
      createMessageApp({ ...config, brokerUrl: 'amqp://broker.test' }),
    ).rejects.toBe(failure);
    expect(brokerClosed).toBe(true);
    expect(realtimeClosed).toBe(true);
    expect(config.state.disconnected).toBe(true);
  });

  // Catches a setup failure before runtime attachment losing database ownership.
  it('closes the created app when HTTP setup fails before runtime starts', async () => {
    const config = options();
    const failure = new Error('HTTP parser setup failure');
    vi.spyOn(NestApplication.prototype, 'useBodyParser').mockImplementation(
      () => {
        throw failure;
      },
    );
    await expect(createMessageApp(config)).rejects.toBe(failure);
    expect(config.state.disconnected).toBe(true);
  });

  // Catches losing the original configuration error when emergency disconnect fails.
  it('preserves provider setup errors when database cleanup also rejects', async () => {
    const config = options();
    config.cursorSecret = 'short';
    config.db.$disconnect = async () => {
      throw new Error('cleanup credentials');
    };
    const errors: unknown[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((entry) => {
      errors.push(entry);
    });
    await expect(createMessageApp(config)).rejects.toThrow(
      'MESSAGE_CURSOR_SECRET must contain at least 32 characters',
    );
    expect(errors).toContainEqual({
      errorCode: 'MESSAGE_SETUP_CLEANUP_FAILED',
    });
    expect(JSON.stringify(errors)).not.toContain('cleanup credentials');
  });

  // Catches a second init scheduling another reconciliation loop, or close failing
  // to cancel the loop and disconnecting the supplied database more than once.
  it('starts reconciliation before init and stops it on repeated close', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const config = options();
    let reconciliations = 0;
    let disconnects = 0;
    vi.spyOn(MessageService.prototype, 'reconcile').mockImplementation(
      async () => {
        reconciliations++;
      },
    );
    config.db.$disconnect = async () => {
      disconnects++;
    };
    const app = await createMessageApp(config);
    apps.push(app);
    await vi.advanceTimersByTimeAsync(30000);
    expect(reconciliations).toBe(1);
    await app.init();
    await vi.advanceTimersByTimeAsync(30000);
    expect(reconciliations).toBe(2);
    await Promise.all([app.close(), app.close()]);
    await app.close();
    await vi.advanceTimersByTimeAsync(60000);
    expect(reconciliations).toBe(2);
    expect(disconnects).toBe(1);
  });

  // Catches propagating database rejection through Nest and leaving signals bound.
  it('logs database cleanup rejection and still releases the HTTP server', async () => {
    const config = options();
    config.db.$disconnect = async () => {
      throw new Error('database credentials');
    };
    const errors: unknown[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((entry) => {
      errors.push(entry);
    });
    const app = await createMessageApp(config);
    apps.push(app);
    await app.listen(0, '127.0.0.1');
    await app.close();
    expect(app.getHttpServer().listening).toBe(false);
    expect(errors).toContainEqual({
      resource: 'database',
      errorCode: 'MESSAGE_CLEANUP_FAILED',
    });
    expect(JSON.stringify(errors)).not.toContain('credentials');
  });
});
