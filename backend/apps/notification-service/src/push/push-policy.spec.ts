import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PushPolicyResolver } from './push-policy.resolver.js';
import type { NotificationEvent } from '../events/event-contracts.js';

describe('PushPolicyResolver', () => {
  const dummyEvent = {
    eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    eventType: 'order.created',
    eventVersion: 1,
    source: 'order-service',
    timestamp: new Date().toISOString(),
    data: { orderId: 'order-1', customerId: 'cust-1' },
  } as unknown as NotificationEvent;

  it('defaults to disabled when no configuration is provided', () => {
    const resolver = new PushPolicyResolver(new ConfigService({}));
    const decision = resolver.resolve(dummyEvent);
    expect(decision.enabled).toBe(false);
    expect(decision.mode).toBe('disabled');
  });

  it('enables simulated policies when PUSH_SIMULATED_POLICIES=true in test env', () => {
    const resolver = new PushPolicyResolver(
      new ConfigService({
        NODE_ENV: 'test',
        PUSH_SIMULATED_POLICIES: 'true',
      }),
    );
    const decision = resolver.resolve(dummyEvent);
    expect(decision.enabled).toBe(true);
    expect(decision.mode).toBe('mandatory');
  });

  it('respects explicit PUSH_EVENT_POLICIES configuration', () => {
    const resolver = new PushPolicyResolver(
      new ConfigService({
        PUSH_EVENT_POLICIES: JSON.stringify({
          'order.created': { enabled: true, mode: 'optional' },
          'matching.found': { enabled: false, mode: 'disabled' },
        }),
      }),
    );

    const decisionOrder = resolver.resolve(dummyEvent);
    expect(decisionOrder.enabled).toBe(true);
    expect(decisionOrder.mode).toBe('optional');

    const decisionMatching = resolver.resolve({
      ...dummyEvent,
      eventType: 'matching.found',
    } as NotificationEvent);
    expect(decisionMatching.enabled).toBe(false);
  });

  it('fails safe to disabled on corrupted JSON configuration', () => {
    const resolver = new PushPolicyResolver(
      new ConfigService({
        PUSH_EVENT_POLICIES: 'invalid{json',
      }),
    );
    const decision = resolver.resolve(dummyEvent);
    expect(decision.enabled).toBe(false);
  });
});
