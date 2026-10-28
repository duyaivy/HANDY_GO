import { describe, it, expect } from 'vitest';
import {
  NotificationPolicy,
  DEFAULT_PRODUCTION_POLICIES,
} from '../src/events/notification-policy.js';
import { ConfigService } from '@nestjs/config';
import type { NotificationEvent } from '../src/events/event-contracts.js';

describe('NotificationPolicy for Bidding & Matching (BE-05 / BE-07 / Safeguard A)', () => {
  function createPolicy(env: Record<string, string> = {}): NotificationPolicy {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new NotificationPolicy(config);
  }

  it('Safeguard A: default policies must be active in production WITHOUT simulated policies enabled', () => {
    // NODE_ENV=production, NOTIFICATION_SIMULATED_POLICIES unset or false
    const policy = createPolicy({
      NODE_ENV: 'production',
      NOTIFICATION_SIMULATED_POLICIES: 'false',
    });

    expect(DEFAULT_PRODUCTION_POLICIES).toBeDefined();

    // 1. bid.submitted
    const bidSubmittedEvent = {
      eventType: 'bid.submitted',
      eventId: 'b0000000-0000-0000-0000-000000000001',
      eventVersion: 1,
      source: 'bidding-service',
      occurredAt: '2026-10-28T23:30:00.000Z',
      data: {
        bidId: 'b0000000-0000-0000-0000-000000000002',
        requestId: 'b0000000-0000-0000-0000-000000000003',
        customerId: 'b0000000-0000-0000-0000-000000000004',
      },
    } as unknown as NotificationEvent;

    const res1 = policy.resolve(bidSubmittedEvent);
    expect(res1.policy).toEqual({
      mode: 'optional',
      roles: ['customer'],
    });

    // 2. bid.revised
    const bidRevisedEvent = {
      ...bidSubmittedEvent,
      eventType: 'bid.revised',
    } as unknown as NotificationEvent;

    const res2 = policy.resolve(bidRevisedEvent);
    expect(res2.policy).toEqual({
      mode: 'optional',
      roles: ['customer'],
    });

    // 3. matching.eligible_workers.ready
    const matchingEligibleEvent = {
      eventType: 'matching.eligible_workers.ready',
      eventId: 'b0000000-0000-0000-0000-000000000005',
      eventVersion: 1,
      source: 'matching-service',
      occurredAt: '2026-10-28T23:30:00.000Z',
      data: {
        requestId: 'b0000000-0000-0000-0000-000000000006',
        matchingRunId: 'b0000000-0000-0000-0000-000000000007',
        chunkId: 'b0000000-0000-0000-0000-000000000008',
        eligibleWorkerIds: ['b0000000-0000-0000-0000-000000000009'],
      },
    } as unknown as NotificationEvent;

    const res3 = policy.resolve(matchingEligibleEvent);
    expect(res3.policy).toEqual({
      mode: 'optional',
      roles: ['worker'],
    });

    // 4. booking_proposal.created
    const proposalCreatedEvent = {
      eventType: 'booking_proposal.created',
      eventId: 'b0000000-0000-0000-0000-000000000010',
      eventVersion: 1,
      source: 'order-service',
      occurredAt: '2026-10-28T23:30:00.000Z',
      data: {
        proposalId: 'b0000000-0000-0000-0000-000000000011',
        requestId: 'b0000000-0000-0000-0000-000000000012',
        customerId: 'b0000000-0000-0000-0000-000000000013',
        workerId: 'b0000000-0000-0000-0000-000000000014',
      },
    } as unknown as NotificationEvent;

    const res4 = policy.resolve(proposalCreatedEvent);
    expect(res4.policy).toEqual({
      mode: 'mandatory',
      roles: ['worker'],
    });

    // 5. matching.completed
    const matchingCompletedEvent = {
      eventType: 'matching.completed',
      eventId: 'b0000000-0000-0000-0000-000000000015',
      eventVersion: 1,
      source: 'matching-service',
      occurredAt: '2026-10-28T23:30:00.000Z',
      data: {
        requestId: 'b0000000-0000-0000-0000-000000000016',
      },
    } as unknown as NotificationEvent;

    const res5 = policy.resolve(matchingCompletedEvent);
    expect(res5.policy).toEqual({
      mode: 'optional',
      roles: ['customer'],
    });
  });

  it('should accept custom NOTIFICATION_EVENT_POLICIES JSON and merge with defaults', () => {
    const customPoliciesJson = JSON.stringify({
      events: {
        'bid.submitted': { mode: 'mandatory', roles: ['customer', 'owner'] },
      },
      transitions: {},
    });

    const policy = createPolicy({
      NOTIFICATION_EVENT_POLICIES: customPoliciesJson,
    });

    const event = {
      eventType: 'bid.submitted',
      data: {},
    } as unknown as NotificationEvent;

    const res = policy.resolve(event);
    expect(res.policy).toEqual({
      mode: 'mandatory',
      roles: ['customer', 'owner'],
    });
  });
});
