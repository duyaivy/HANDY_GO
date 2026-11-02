import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/notification-client';

// Test-only creation. There is deliberately no public send/create endpoint.
export function notificationFixture(
  recipientUserId: string,
  overrides: Partial<Prisma.NotificationCreateInput> = {},
): Prisma.NotificationCreateInput {
  return {
    recipientUserId,
    sourceEventId: randomUUID(),
    eventType: 'order.created',
    category: 'order',
    sourceService: 'order-service',
    dedupeKey: randomUUID(),
    title: 'Order created',
    body: 'Your order is ready to review.',
    payload: { screen: 'order-details' },
    ...overrides,
  };
}
