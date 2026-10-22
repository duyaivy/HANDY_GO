import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isRecord,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from '../events/event-contracts.js';

export interface PushPolicy {
  enabled: boolean;
  mode: 'mandatory' | 'optional' | 'disabled';
}

export interface PushPolicyDecision {
  enabled: boolean;
  mode: 'mandatory' | 'optional' | 'disabled';
  skipReason?: string;
}

export function simulatedPushPolicies(): Record<string, PushPolicy> {
  const map: Record<string, PushPolicy> = {};
  for (const type of NOTIFICATION_EVENTS) {
    map[type] = {
      enabled: true,
      mode:
        type.startsWith('matching.') || type.startsWith('bid.')
          ? 'optional'
          : 'mandatory',
    };
  }
  return map;
}

@Injectable()
export class PushPolicyResolver {
  private readonly policies: Record<string, PushPolicy>;

  constructor(config: ConfigService) {
    const isSimulated =
      config.get<string>('PUSH_SIMULATED_POLICIES') === 'true' ||
      config.get<string>('NOTIFICATION_SIMULATED_POLICIES') === 'true';

    const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';

    if (isSimulated && ['test', 'development'].includes(nodeEnv)) {
      this.policies = simulatedPushPolicies();
      return;
    }

    const raw = config.get<string>('PUSH_EVENT_POLICIES');
    if (!raw) {
      this.policies = {};
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!isRecord(parsed)) {
        this.policies = {};
        return;
      }

      const map: Record<string, PushPolicy> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (
          isRecord(val) &&
          typeof val.mode === 'string' &&
          ['mandatory', 'optional', 'disabled'].includes(val.mode)
        ) {
          map[key] = {
            enabled: val.mode !== 'disabled' && val.enabled !== false,
            mode: val.mode as PushPolicy['mode'],
          };
        }
      }
      this.policies = map;
    } catch {
      this.policies = {};
    }
  }

  resolve(event: NotificationEvent): PushPolicyDecision {
    const policy = this.policies[event.eventType];
    if (!policy || !policy.enabled || policy.mode === 'disabled') {
      return {
        enabled: false,
        mode: 'disabled',
        skipReason: 'PUSH_POLICY_DISABLED',
      };
    }

    return {
      enabled: true,
      mode: policy.mode,
    };
  }
}
