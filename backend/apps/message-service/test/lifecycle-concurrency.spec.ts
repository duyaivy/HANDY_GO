import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessagePrisma } from '../src/persistence.js';
import { MessageService } from '../src/message.service.js';
import { AuthorityClient } from '../src/authority.js';
import { CursorCodec } from '../src/security.js';

// Must use the disposable database owned by scripts/test-message-runtime.mjs.
describe.runIf(process.env.MESSAGE_TEST_DATABASE_URL)(
  'PostgreSQL lifecycle concurrency',
  () => {
    let db: MessagePrisma;
    beforeAll(async () => {
      db = new MessagePrisma(process.env.MESSAGE_TEST_DATABASE_URL!);
      await db.$connect();
    });
    afterAll(async () => {
      await db?.$disconnect();
    });
    const seed = () =>
      db.conversation.create({
        data: {
          requestId: randomUUID(),
          customerId: randomUUID(),
          workerId: randomUUID(),
        },
      });
    const proof = (send: boolean) => ({
      permissions: { read: true, create: send, send },
      orderId: null,
    });
    const makeService = (permission = vi.fn(async () => proof(true))) =>
      new MessageService(
        db,
        {
          permission,
          clearPermissionCache: vi.fn(),
        } as unknown as AuthorityClient,
        new CursorCodec('k'.repeat(32)),
      );
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    it('keeps legitimate chats OPEN and admits a database write after an unrelated bid', async () => {
      const c = await seed();
      await makeService().invalidate(randomUUID(), 'bid.submitted', {
        requestId: c.requestId,
        workerId: randomUUID(),
      });
      expect(
        (await db.conversation.findUniqueOrThrow({ where: { id: c.id } }))
          .status,
      ).toBe('OPEN');
      const message = await db.message.create({
        data: {
          conversationId: c.id,
          senderId: c.customerId,
          clientMessageId: randomUUID(),
          messageType: 'TEXT',
          content: 'Still writable',
        },
      });
      expect(message.sequence).toBe(1n);
    });

    it('claims a concurrent duplicate event once across service instances', async () => {
      const c = await seed(),
        eventId = randomUUID();
      const a = makeService(),
        b = makeService();
      const notifyA = vi.fn(),
        notifyB = vi.fn();
      a.onInvalidation = notifyA;
      b.onInvalidation = notifyB;
      await Promise.all([
        a.invalidate(eventId, 'bid.submitted', { requestId: c.requestId }),
        b.invalidate(eventId, 'bid.submitted', { requestId: c.requestId }),
      ]);
      expect(await db.consumedEvent.count({ where: { eventId } })).toBe(1);
      expect(notifyA.mock.calls.length + notifyB.mock.calls.length).toBe(1);
    });

    it('a delayed reconciliation cannot reopen a conversation after concurrent revocation', async () => {
      const c = await seed();
      const started = deferred<void>(),
        release = deferred<void>();
      const old = makeService(
        vi.fn(async () => {
          started.resolve();
          await release.promise;
          return proof(true);
        }),
      );
      // Bound reconciliation to this fixture, without changing the real transaction client.
      const read = vi
        .spyOn(db.conversation, 'findMany')
        .mockResolvedValueOnce([c]);
      const reconciling = old.reconcile();
      await started.promise;
      const newer = makeService(vi.fn(async () => proof(false)));
      const invalidating = newer.invalidate(randomUUID(), 'bid.withdrawn', {
        requestId: c.requestId,
      });
      try {
        await vi.waitFor(async () => {
          const blocked = await db.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'`;
          expect(Number(blocked[0].count)).toBeGreaterThan(0);
        });
      } finally {
        release.resolve();
        await Promise.all([reconciling, invalidating]);
        read.mockRestore();
      }
      expect(
        (await db.conversation.findUniqueOrThrow({ where: { id: c.id } }))
          .status,
      ).toBe('READ_ONLY');
      await expect(
        db.message.create({
          data: {
            conversationId: c.id,
            senderId: c.customerId,
            clientMessageId: randomUUID(),
            messageType: 'TEXT',
            content: 'Denied',
          },
        }),
      ).rejects.toThrow();
    });

    it('rolls back the consumed marker when a newer local event overtakes an authority read', async () => {
      const c = await seed();
      const started = deferred<void>(),
        release = deferred<void>();
      const permission = vi
        .fn()
        .mockImplementationOnce(async () => {
          started.resolve();
          await release.promise;
          return proof(true);
        })
        .mockResolvedValue(proof(false));
      const service = makeService(permission),
        oldId = randomUUID();
      const older = service.invalidate(oldId, 'bid.submitted', {
        requestId: c.requestId,
      });
      const rejected = expect(older).rejects.toThrow('ELIGIBILITY_UNAVAILABLE');
      await started.promise;
      const newer = service.invalidate(randomUUID(), 'bid.withdrawn', {
        requestId: c.requestId,
      });
      release.resolve();
      await Promise.all([rejected, newer]);
      expect(
        await db.consumedEvent.findUnique({ where: { eventId: oldId } }),
      ).toBeNull();
      await service.invalidate(oldId, 'bid.submitted', {
        requestId: c.requestId,
      });
      expect(
        (await db.conversation.findUniqueOrThrow({ where: { id: c.id } }))
          .status,
      ).toBe('READ_ONLY');
      expect(await db.consumedEvent.count({ where: { eventId: oldId } })).toBe(
        1,
      );
    });
  },
);
