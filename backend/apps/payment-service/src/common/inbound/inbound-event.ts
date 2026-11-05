import { isUUID } from 'class-validator';

// Marks an inbound event that can never succeed (malformed or contradicting existing state).
// Retrying it would only waste attempts, so it is parked as `dead` immediately.
export class PermanentInboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentInboundError';
  }
}

// Expected, temporary condition (for example an Order event arriving before its prerequisite).
export class RetryableInboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableInboundError';
  }
}

export interface InboundEvent {
  eventId: string;
  data: Record<string, unknown>;
}

// Producers publish either the shared envelope (`data`/`payload` + `eventId`) or a flat object.
export function unwrapInboundEvent(raw: unknown): InboundEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PermanentInboundError('Event payload is not an object');
  }
  const envelope = raw as Record<string, unknown>;
  const nested = [envelope.data, envelope.payload].find(
    (value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value),
  );
  const data = nested ?? envelope;
  const eventId = [envelope.eventId, data.eventId, envelope.id].find(
    (value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200,
  );
  if (!eventId) throw new PermanentInboundError('Event has no usable eventId');
  return { eventId, data };
}

export function requireUuid(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && isUUID(value)) return value;
  }
  throw new PermanentInboundError(`${keys[0]} must be a valid UUID`);
}

export function requirePositiveInteger(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new PermanentInboundError(`${key} must be a positive integer string`);
  }
  const amount = BigInt(value);
  if (amount > 9223372036854775807n) throw new PermanentInboundError(`${key} exceeds BIGINT`);
  return amount;
}
