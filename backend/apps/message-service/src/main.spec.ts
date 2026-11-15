import 'reflect-metadata';
import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { MessageBroker } from './broker.js';
import { MessageRealtime } from './realtime.js';

const database = vi.hoisted(() => ({ disconnected: false }));
// Only connection I/O is replaced; startup composition and HTTP bind failure are real.
vi.mock('./persistence.js', async (original) => {
  const { MessagePrisma } = await original<typeof import('./persistence.js')>();
  return {
    MessagePrisma: class extends MessagePrisma {
      constructor() {
        super('postgresql://test:test@127.0.0.1:5432/test');
      }
      $connect = async () => {};
      $disconnect = async () => {
        database.disconnected = true;
      };
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Catches only disconnecting Prisma after listen fails, leaving attached transport alive.
it('closes the created application when the configured HTTP port is occupied', async () => {
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const address = blocker.address();
  if (!address || typeof address === 'string')
    throw new Error('No TCP address');
  for (const [name, value] of Object.entries({
    PORT: String(address.port),
    MESSAGE_HOST: '127.0.0.1',
    INTERNAL_SERVICE_SECRET: 'test',
    BIDDING_SERVICE_URL: 'http://bidding.test',
    ORDER_SERVICE_URL: 'http://order.test',
    AUTH_SERVICE_URL: 'http://auth.test',
    MEDIA_SERVICE_URL: 'http://media.test',
    MESSAGE_CURSOR_SECRET: 's'.repeat(32),
    RABBITMQ_URL: 'amqp://broker.test',
  }))
    vi.stubEnv(name, value);
  vi.spyOn(MessageBroker.prototype, 'start').mockImplementation(() => {});
  vi.spyOn(MessageBroker.prototype, 'close').mockResolvedValue();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let realtimeClosed = false;
  const close = MessageRealtime.prototype.close;
  vi.spyOn(MessageRealtime.prototype, 'close').mockImplementation(
    async function (this: MessageRealtime) {
      await close.call(this);
      realtimeClosed = true;
    },
  );
  const exitCode = process.exitCode;
  try {
    await import('./main.js');
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(database.disconnected).toBe(true);
    expect(realtimeClosed).toBe(true);
  } finally {
    process.exitCode = exitCode;
    await new Promise<void>((resolve, reject) =>
      blocker.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
