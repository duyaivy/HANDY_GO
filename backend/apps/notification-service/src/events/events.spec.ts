import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { eventFixture } from '../../test/event-fixtures.js';
import {
  NOTIFICATION_EVENTS,
  validateNotificationEvent,
} from './event-contracts.js';
import { NotificationRouter } from './notification-router.js';
import { NotificationPolicy } from './notification-policy.js';
import { renderNotificationTemplate } from './notification-templates.js';

describe('Notification event contracts, routing, templates and policies', () => {
  const router = new NotificationRouter();
  const simulated = new NotificationPolicy(
    new ConfigService({
      NODE_ENV: 'test',
      NOTIFICATION_SIMULATED_POLICIES: 'true',
    }),
  );

  it.each(NOTIFICATION_EVENTS)('validates and routes %s', (type) => {
    const fixture = eventFixture(type);
    const event = validateNotificationEvent(
      { pattern: type, data: fixture },
      type,
    );
    expect(event).toEqual(fixture);
    const route = router.resolve(event);
    expect(route.recipients.length).toBeGreaterThan(0);
    for (const recipient of route.recipients) {
      const template = renderNotificationTemplate(type, recipient.role);
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.body).not.toContain('{{');
      expect(template.body).not.toContain(recipient.userId);
    }
  });

  it.each([
    ['bid.submitted', 'customer'],
    ['bid.revised', 'customer'],
    ['booking_proposal.created', 'worker'],
    ['booking_proposal.changes_requested', 'customer'],
    ['booking_proposal.rejected', 'customer'],
    ['payment.succeeded', 'payer'],
    ['payment.failed', 'payer'],
    ['payment.refunded', 'recipient'],
    ['wallet.credited', 'owner'],
    ['wallet.debited', 'owner'],
    ['wallet.balance.adjusted', 'owner'],
  ] as const)('resolves only the intended %s recipient', (type, role) => {
    expect(
      router.resolve(eventFixture(type)).recipients.map((r) => r.role),
    ).toEqual([role]);
  });

  it('accepts producer/eventVersion convention and version alias, stripping unknown data', () => {
    const event = eventFixture('bid.submitted');
    expect(
      validateNotificationEvent({
        pattern: event.eventType,
        data: {
          ...event,
          eventType: undefined,
          source: undefined,
          producer: event.source,
          data: { ...event.data, sensitiveToken: 'never-store' },
        },
      }),
    ).toEqual(event);
    expect(
      validateNotificationEvent({
        ...event,
        eventVersion: undefined,
        version: 1,
      }),
    ).toEqual(event);
  });

  it.each([
    { eventVersion: 2 },
    { eventVersion: null, version: 1 },
    { version: 2 },
    { eventId: 'test-id' },
    { source: 'forged-service' },
    { source: null, producer: 'bidding-service' },
    { producer: 'conflicting-service' },
    { occurredAt: '2026-02-30T10:00:00Z' },
    { occurredAt: '2026-10-20' },
    { correlationId: 'unsafe\nlog' },
    { eventType: 'unsupported' },
    { data: {} },
    { data: { customerId: 'invalid' } },
  ])('rejects invalid envelopes/payloads %#', (override) => {
    expect(() =>
      validateNotificationEvent({
        ...eventFixture('bid.submitted'),
        ...override,
      }),
    ).toThrow();
  });

  it('rejects wrong routing keys and conflicting Nest packet patterns', () => {
    const event = eventFixture('bid.submitted');
    expect(() => validateNotificationEvent(event, 'bid.revised')).toThrow(
      'ROUTING_MISMATCH',
    );
    expect(() =>
      validateNotificationEvent({ pattern: 'bid.revised', data: event }),
    ).toThrow('ROUTING_MISMATCH');
  });

  it('normalizes UUID case and bounds and deduplicates matching recipients', () => {
    const fixture = eventFixture('matching.eligible_workers.ready');
    const id = randomUUID();
    const payload = {
      ...fixture,
      data: { ...fixture.data, eligibleWorkerIds: [id, id.toUpperCase()] },
    };
    expect(validateNotificationEvent(payload).data).toMatchObject({
      eligibleWorkerIds: [id],
    });
    for (const ids of [
      [],
      ['bad'],
      Array.from({ length: 501 }, () => randomUUID()),
    ]) {
      expect(() =>
        validateNotificationEvent({
          ...fixture,
          data: { ...fixture.data, eligibleWorkerIds: ids },
        }),
      ).toThrow();
    }
  });

  it('keeps unapproved business rules pending and forbids simulated policies in production', () => {
    const pending = new NotificationPolicy(
      new ConfigService({ NOTIFICATION_SIMULATED_POLICIES: 'false' }),
    );
    expect(() => pending.resolve(eventFixture('order.created'))).toThrow(
      'BUSINESS_POLICY_PENDING',
    );
    expect(
      () =>
        new NotificationPolicy(
          new ConfigService({
            NODE_ENV: 'production',
            NOTIFICATION_SIMULATED_POLICIES: 'true',
          }),
        ),
    ).toThrow('SIMULATED_POLICIES_REQUIRE_TEST_OR_DEVELOPMENT');
  });

  it('skips unknown transitions and delegates terminal status notices to dedicated events', () => {
    const event = eventFixture('order.status.changed');
    expect(simulated.resolve(event)).toEqual({
      skipReason: 'TRANSITION_POLICY_PENDING',
    });
    for (const notificationKind of ['completed', 'cancelled']) {
      expect(
        simulated.resolve(
          validateNotificationEvent({
            ...event,
            data: { ...event.data, notificationKind },
          }),
        ),
      ).toEqual({ skipReason: 'DEDICATED_LIFECYCLE_EVENT' });
    }
  });

  it('uses a reviewed transition allowlist without inventing an order state machine', () => {
    const policies = new NotificationPolicy(
      new ConfigService({
        NOTIFICATION_EVENT_POLICIES: JSON.stringify({
          events: {},
          transitions: {
            'TEST_BEFORE->TEST_AFTER': {
              mode: 'optional',
              roles: ['worker'],
              template: {
                title: 'Cập nhật thử nghiệm',
                body: '{{audience}} có cập nhật thử nghiệm.',
              },
            },
          },
        }),
      }),
    );
    expect(policies.resolve(eventFixture('order.status.changed'))).toEqual({
      policy: {
        mode: 'optional',
        roles: ['worker'],
        template: {
          title: 'Cập nhật thử nghiệm',
          body: '{{audience}} có cập nhật thử nghiệm.',
        },
      },
    });
  });

  it.each([
    'bad-json',
    '{}',
    '{"events":{"typo":{}},"transitions":{}}',
    '{"events":{"bid.submitted":{"mode":"optional","roles":[]}},"transitions":{}}',
    '{"events":{},"transitions":{"TEST_BEFORE->TEST_AFTER":{"mode":"mandatory","roles":["worker"]}}}',
    '{"events":{},"transitions":{"TEST_BEFORE->TEST_AFTER":{"mode":"mandatory","roles":["worker"],"template":{"title":"Test","body":"{{secret}}"}}}}',
  ])('rejects invalid policy configuration %s', (raw) => {
    expect(
      () =>
        new NotificationPolicy(
          new ConfigService({ NOTIFICATION_EVENT_POLICIES: raw }),
        ),
    ).toThrow();
  });
});
