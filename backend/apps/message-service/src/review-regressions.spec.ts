import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageService } from './message.service.js';
import { CursorCodec } from './security.js';

describe('PR 68 regressions', () => {
  let c: any, db: any, authority: any, service: MessageService;
  let consumed: Set<string>;
  beforeEach(() => {
    c = {
      id: randomUUID(),
      requestId: randomUUID(),
      customerId: randomUUID(),
      workerId: randomUUID(),
      orderId: null,
      status: 'OPEN',
      lastSequence: 3n,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
    };
    consumed = new Set();
    db = {
      conversation: {
        findUnique: vi.fn(async () => ({ ...c })),
        findMany: vi.fn(async () => [{ ...c }]),
        update: vi.fn(async ({ data }) => Object.assign(c, data)),
        updateMany: vi.fn(async ({ data }) => {
          Object.assign(c, data);
          return { count: 1 };
        }),
      },
      consumedEvent: {
        findUnique: vi.fn(async ({ where }) =>
          consumed.has(where.eventId) ? where : null,
        ),
        create: vi.fn(async ({ data }) => {
          consumed.add(data.eventId);
          return data;
        }),
        createMany: vi.fn(async ({ data }) => {
          if (consumed.has(data.eventId)) return { count: 0 };
          consumed.add(data.eventId);
          return { count: 1 };
        }),
      },
      message: { findMany: vi.fn(async () => []) },
      $queryRaw: vi.fn(async () => [{ id: c.id }]),
      $transaction: vi.fn(async (fn) => fn(db)),
    };
    authority = {
      clearPermissionCache: vi.fn(),
      permission: vi.fn(async () => ({
        permissions: { read: true, send: true, create: true },
        orderId: null,
      })),
      media: vi.fn(async () => {
        throw new Error('Media unavailable');
      }),
    };
    service = new MessageService(
      db,
      authority,
      new CursorCodec('k'.repeat(32)),
    );
  });

  it('another worker submitting a bid keeps the existing chat immediately writable', async () => {
    await service.invalidate(randomUUID(), 'bid.submitted', {
      requestId: c.requestId,
      workerId: randomUUID(),
    });
    expect(c.status).toBe('OPEN');
    await expect(
      service.permission(c.customerId, c, true),
    ).resolves.toMatchObject({ permissions: { send: true } });
  });

  it('revocation closes writes and duplicate delivery does not repeat writes or notifications', async () => {
    authority.permission.mockResolvedValue({
      permissions: { send: false },
      orderId: null,
    });
    const notify = vi.fn();
    service.onInvalidation = notify;
    const eventId = randomUUID();
    await service.invalidate(eventId, 'bid.withdrawn', {
      requestId: c.requestId,
    });
    expect(c.status).toBe('READ_ONLY');
    const writes =
      db.conversation.update.mock.calls.length +
      db.conversation.updateMany.mock.calls.length;
    await service.invalidate(eventId, 'bid.withdrawn', {
      requestId: c.requestId,
    });
    expect(
      db.conversation.update.mock.calls.length +
        db.conversation.updateMany.mock.calls.length,
    ).toBe(writes);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('fails closed for authority failure without dropping the event', async () => {
    authority.permission.mockRejectedValue(new Error('Timeout'));
    const eventId = randomUUID();
    await service.invalidate(eventId, 'order.status.changed', {
      requestId: c.requestId,
    });
    expect(c.status).toBe('READ_ONLY');
    expect(consumed.has(eventId)).toBe(true);
  });

  it('recovers order-only events and preserves chat for the selected worker', async () => {
    const orderId = randomUUID();
    authority.permission.mockResolvedValue({
      permissions: { send: true },
      orderId,
    });
    await service.invalidate(randomUUID(), 'order.status.changed', {
      orderId,
      customerId: c.customerId,
      workerId: c.workerId,
    });
    expect(c).toMatchObject({ orderId, status: 'OPEN' });
  });

  it('reconciliation locks the conversation and bypasses cached permission proofs', async () => {
    await service.reconcile();
    expect(authority.permission).toHaveBeenCalledWith(
      c.customerId,
      expect.objectContaining({ id: c.id }),
      true,
      undefined,
      undefined,
      expect.any(Number),
      false,
    );
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('preserves mixed history and stored metadata when one attachment is unavailable', async () => {
    const message = (sequence: bigint, attachments: any[] = []) => ({
      id: randomUUID(),
      conversationId: c.id,
      senderId: c.customerId,
      clientMessageId: randomUUID(),
      sequence,
      messageType: attachments.length ? 'IMAGE' : 'TEXT',
      content: attachments.length ? null : `Text ${sequence}`,
      replyToId: null,
      replyTo: null,
      attachments,
      createdAt: new Date(),
    });
    const asset = {
      id: randomUUID(),
      storageKey: 'private/missing',
      mediaType: 'IMAGE',
      mimeType: 'image/jpeg',
      sizeBytes: 100n,
      position: 0,
      width: 100,
      height: 80,
      durationMs: null,
    };
    const good = {
      ...asset,
      id: randomUUID(),
      storageKey: 'private/good',
      position: 1,
    };
    authority.media.mockImplementation(async (key: string) => {
      if (key === good.storageKey)
        return {
          url: 'https://media.test/good',
          urlExpiresAt: '2099-01-01T00:00:00.000Z',
        };
      throw new Error('Timeout');
    });
    db.message.findMany.mockResolvedValue([
      message(3n),
      message(2n, [asset, good]),
      message(1n),
    ]);
    const page = await service.history(c.customerId, c.id, { limit: 3 });
    expect(page.items.map((item) => item.sequence)).toEqual(['1', '2', '3']);
    expect(page.items.map((item) => item.content)).toEqual([
      'Text 1',
      null,
      'Text 3',
    ]);
    expect(page.items[1].attachments[0]).toMatchObject({
      ...asset,
      sizeBytes: 100,
      unavailable: true,
      url: null,
      urlExpiresAt: null,
    });
    expect(page.items[1].attachments[1]).toMatchObject({
      unavailable: false,
      url: 'https://media.test/good',
    });
    expect(page.highWaterSequence).toBe('3');
    expect(page.nextBeforeSequence).toBeNull();
  });
});
