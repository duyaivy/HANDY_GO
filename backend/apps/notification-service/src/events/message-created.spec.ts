import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { validateNotificationEvent } from './event-contracts.js';
import { NotificationRouter } from './notification-router.js';
import { NotificationPolicy } from './notification-policy.js';
import { renderNotificationTemplate } from './notification-templates.js';
import { PushPolicyResolver } from '../push/push-policy.resolver.js';
import { EventProcessorService } from './event-processor.service.js';

function fixture() {
  return {
    eventId: randomUUID(),
    eventType: 'message.created',
    eventVersion: 1,
    producer: 'message-service',
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    data: {
      messageId: randomUUID(),
      conversationId: randomUUID(),
      requestId: randomUUID(),
      orderId: null,
      senderId: randomUUID(),
      recipientId: randomUUID(),
      sequence: '9007199254740993',
      messageType: 'TEXT',
    },
  };
}
function config(values: Record<string, unknown> = {}) {
  const result = new ConfigService(values);
  result.skipProcessEnv = true;
  return result;
}

describe('private message notifications', () => {
  it('accepts the Message producer contract and strips private business data', () => {
    const input = fixture();
    const event = validateNotificationEvent({
      ...input,
      data: { ...input.data, content: 'private draft', url: 'private-url' },
    });
    expect(event.source).toBe('message-service');
    expect(event.data).toEqual(input.data);
    const route = new NotificationRouter().resolve(event);
    expect(route).toEqual({
      category: 'chat',
      entityId: input.data.conversationId,
      requestId: input.data.requestId,
      recipients: [{ userId: input.data.recipientId, role: 'recipient' }],
    });
    expect(renderNotificationTemplate(event.eventType, 'recipient')).toEqual({
      title: 'Tin nhắn mới',
      body: 'Bạn có tin nhắn mới về yêu cầu dịch vụ.',
    });
  });
  it.each([
    { sequence: '01' },
    { sequence: '9223372036854775808' },
    { sequence: 1 },
    { messageType: ['IMAGE'] },
    { messageType: 'VOICE' },
    { orderId: 'bad' },
  ])('rejects malformed message metadata %#', (override) => {
    const input = fixture();
    expect(() =>
      validateNotificationEvent({
        ...input,
        data: { ...input.data, ...override },
      }),
    ).toThrow();
  });
  it('rejects forged producers and self-recipient events', () => {
    const input = fixture();
    expect(() =>
      validateNotificationEvent({ ...input, producer: 'bidding-service' }),
    ).toThrow();
    expect(() =>
      validateNotificationEvent({
        ...input,
        data: { ...input.data, recipientId: input.data.senderId },
      }),
    ).toThrow();
  });
  it('respects optional in-app and push preferences by default and explicit push disablement', () => {
    const event = validateNotificationEvent(fixture());
    expect(new NotificationPolicy(config()).resolve(event)).toEqual({
      policy: { mode: 'optional', roles: ['recipient'] },
    });
    expect(new PushPolicyResolver(config()).resolve(event)).toEqual({
      enabled: true,
      mode: 'optional',
    });
    expect(
      new PushPolicyResolver(
        config({
          PUSH_EVENT_POLICIES: JSON.stringify({
            'message.created': { mode: 'disabled' },
          }),
        }),
      ).resolve(event).enabled,
    ).toBe(false);
  });
  it('deduplicates the same logical message across replayed event IDs and stores a conversation deep link', async () => {
    const saved = new Map<string, any>();
    const inbox = new Set<string>();
    const tx = {
      consumedEvent: {
        createMany: async ({ data }: any) => {
          const fresh = !inbox.has(data[0].eventId);
          inbox.add(data[0].eventId);
          return { count: Number(fresh) };
        },
      },
    };
    const db = { $transaction: async (run: any) => run(tx) };
    const notifications = {
      createInAppBatch: async (_tx: any, rows: any[]) => {
        let count = 0;
        for (const row of rows)
          if (!saved.has(row.dedupeKey)) {
            saved.set(row.dedupeKey, row);
            count++;
          }
        return count;
      },
    };
    const preferences = {
      findInAppOptOuts: async () => new Set(),
      findPushOptOuts: async () => new Set(),
    };
    const pushJobs = { schedulePushAttempts: vi.fn(async () => 1) };
    const input = fixture();
    const processor = new EventProcessorService(
      db as any,
      notifications as any,
      preferences as any,
      new NotificationRouter(),
      new NotificationPolicy(config()),
      {
        findActiveByUserIds: async () => [
          { id: randomUUID(), userId: input.data.recipientId },
        ],
      } as any,
      pushJobs as any,
      new PushPolicyResolver(config()),
    );
    await processor.process(validateNotificationEvent(input));
    await processor.process(
      validateNotificationEvent({ ...input, eventId: randomUUID() }),
    );
    expect(saved.size).toBe(1);
    const row = [...saved.values()][0];
    expect(row.dedupeKey).toBe(
      `message.created:${input.data.messageId}:${input.data.recipientId}`,
    );
    expect(row.payload).toMatchObject({
      conversationId: input.data.conversationId,
      entityId: input.data.conversationId,
      requestId: input.data.requestId,
    });
    expect(JSON.stringify(row)).not.toContain('private draft');
    expect(pushJobs.schedulePushAttempts).toHaveBeenCalledTimes(1);
  });
});
