import { randomUUID } from 'node:crypto';
import {
  EVENT_CONTRACTS,
  NOTIFICATION_EVENTS,
  validateNotificationEvent,
  type NotificationEvent,
  type NotificationEventType,
} from '../src/events/event-contracts.js';

/** Simulated contracts, not production publishers. All stored IDs are UUIDs. */
export function eventFixture(type: NotificationEventType): NotificationEvent {
  const contract = EVENT_CONTRACTS[type];
  const data: Record<string, unknown> = Object.fromEntries(
    contract.ids.map((id) => [id, randomUUID()]),
  );
  if (type === 'matching.eligible_workers.ready')
    data.eligibleWorkerIds = [randomUUID(), randomUUID()];
  if (type === 'order.status.changed')
    Object.assign(data, {
      previousStatus: 'TEST_BEFORE',
      nextStatus: 'TEST_AFTER',
      notificationKind: 'status_update',
    });
  return validateNotificationEvent({
    eventId: randomUUID(),
    eventType: type,
    eventVersion: 1,
    source: contract.source,
    occurredAt: new Date().toISOString(),
    correlationId: `simulation-${randomUUID()}`,
    data,
  });
}

export function allEventFixtures(): NotificationEvent[] {
  return NOTIFICATION_EVENTS.map(eventFixture);
}
