import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isRecord,
  NOTIFICATION_EVENTS,
  PermanentEventError,
  type NotificationEvent,
  type NotificationEventType,
} from './event-contracts.js';
import type {
  NotificationTemplate,
  RecipientRole,
} from './notification-templates.js';

export interface EventPolicy {
  mode: 'mandatory' | 'optional' | 'disabled';
  roles: RecipientRole[];
  template?: NotificationTemplate;
}
export interface PolicyConfiguration {
  events: Partial<Record<NotificationEventType, EventPolicy>>;
  transitions: Record<string, EventPolicy>;
}

/** Illustrative choices only. Explicit opt-in and NODE_ENV guard are mandatory. */
export function simulatedPolicies(): PolicyConfiguration {
  const events = Object.fromEntries(
    NOTIFICATION_EVENTS.map((type) => [
      type,
      {
        mode:
          type.startsWith('matching.') || type.startsWith('bid.')
            ? 'optional'
            : 'mandatory',
        roles: ['customer', 'worker', 'payer', 'recipient', 'owner'],
      },
    ]),
  ) as PolicyConfiguration['events'];
  events['order.completed'] = { mode: 'mandatory', roles: ['customer'] };
  return { events, transitions: {} };
}

function parsePolicy(value: unknown, transition = false): EventPolicy {
  if (
    !isRecord(value) ||
    typeof value.mode !== 'string' ||
    !['mandatory', 'optional', 'disabled'].includes(value.mode) ||
    !Array.isArray(value.roles) ||
    value.roles.length === 0 ||
    value.roles.some(
      (role) =>
        typeof role !== 'string' ||
        !['customer', 'worker', 'payer', 'recipient', 'owner'].includes(role),
    )
  )
    throw new Error('INVALID_NOTIFICATION_POLICY');
  if (transition && value.mode !== 'disabled') {
    const template = value.template;
    if (
      !isRecord(template) ||
      typeof template.title !== 'string' ||
      !template.title.trim() ||
      template.title.length > 300 ||
      typeof template.body !== 'string' ||
      !template.body.trim() ||
      template.body.length > 2000 ||
      /[{}]/.test(template.title) ||
      /[{}]/.test(template.body.replaceAll('{{audience}}', ''))
    )
      throw new Error('INVALID_NOTIFICATION_TRANSITION_TEMPLATE');
  } else if (value.template !== undefined) {
    throw new Error('UNEXPECTED_NOTIFICATION_TEMPLATE');
  }
  return value as unknown as EventPolicy;
}

@Injectable()
export class NotificationPolicy {
  private readonly policies: PolicyConfiguration;

  constructor(config: ConfigService) {
    if (config.get<string>('NOTIFICATION_SIMULATED_POLICIES') === 'true') {
      if (
        !['test', 'development'].includes(config.get<string>('NODE_ENV') ?? '')
      )
        throw new Error('SIMULATED_POLICIES_REQUIRE_TEST_OR_DEVELOPMENT');
      this.policies = simulatedPolicies();
      return;
    }
    const raw = config.get<string>('NOTIFICATION_EVENT_POLICIES');
    if (!raw) {
      this.policies = { events: {}, transitions: {} };
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new Error('INVALID_NOTIFICATION_POLICY_JSON');
    }
    if (
      !isRecord(input) ||
      !isRecord(input.events) ||
      !isRecord(input.transitions)
    )
      throw new Error('INVALID_NOTIFICATION_POLICY_CONFIG');
    const events: PolicyConfiguration['events'] = {};
    for (const [key, value] of Object.entries(input.events)) {
      if (!NOTIFICATION_EVENTS.includes(key as NotificationEventType))
        throw new Error('UNKNOWN_NOTIFICATION_POLICY_EVENT');
      events[key as NotificationEventType] = parsePolicy(value);
    }
    const transitions: Record<string, EventPolicy> = {};
    for (const [key, value] of Object.entries(input.transitions)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}->[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key))
        throw new Error('INVALID_NOTIFICATION_POLICY_TRANSITION');
      transitions[key] = parsePolicy(value, true);
    }
    this.policies = { events, transitions };
  }

  resolve(event: NotificationEvent): {
    policy?: EventPolicy;
    skipReason?: string;
  } {
    if (event.eventType === 'order.status.changed') {
      if (event.data.notificationKind !== 'status_update')
        return { skipReason: 'DEDICATED_LIFECYCLE_EVENT' };
      const policy =
        this.policies.transitions[
          `${event.data.previousStatus}->${event.data.nextStatus}`
        ];
      return policy ? { policy } : { skipReason: 'TRANSITION_POLICY_PENDING' };
    }
    const policy = this.policies.events[event.eventType];
    // Preserve unapproved events for review/replay instead of applying guessed rules.
    if (!policy) throw new PermanentEventError('BUSINESS_POLICY_PENDING');
    return { policy };
  }
}
