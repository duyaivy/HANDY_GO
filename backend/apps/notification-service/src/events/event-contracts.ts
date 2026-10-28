import { isISO8601, isUUID } from 'class-validator';

export const NOTIFICATION_EVENTS = [
  'matching.eligible_workers.ready',
  'bid.submitted',
  'bid.revised',
  'booking_proposal.created',
  'booking_proposal.changes_requested',
  'booking_proposal.rejected',
  'order.created',
  'order.status.changed',
  'order.cancelled',
  'order.completed',
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
  'wallet.credited',
  'wallet.debited',
  'wallet.balance.adjusted',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number];
type BidData = { bidId: string; requestId: string; customerId: string };
type ProposalData = {
  proposalId: string;
  requestId: string;
  customerId: string;
  workerId: string;
};
type OrderData = { orderId: string; customerId: string; workerId: string };
type WalletData = {
  walletOwnerId: string;
  transactionId: string;
  reason?: string;
  paymentId?: string;
  orderId?: string;
  referenceType?: string;
};

export interface EventDataMap {
  'matching.eligible_workers.ready': {
    requestId: string;
    matchingRunId: string;
    chunkId: string;
    eligibleWorkerIds: string[];
  };
  'bid.submitted': BidData;
  'bid.revised': BidData;
  'booking_proposal.created': ProposalData;
  'booking_proposal.changes_requested': ProposalData;
  'booking_proposal.rejected': ProposalData;
  'order.created': OrderData;
  'order.status.changed': OrderData & {
    previousStatus: string;
    nextStatus: string;
    notificationKind: 'status_update' | 'completed' | 'cancelled';
  };
  'order.cancelled': OrderData;
  'order.completed': OrderData;
  'payment.succeeded': { paymentId: string; payerId: string };
  'payment.failed': { paymentId: string; payerId: string };
  'payment.refunded': {
    paymentId: string;
    refundId: string;
    recipientId: string;
  };
  'wallet.credited': WalletData;
  'wallet.debited': WalletData;
  'wallet.balance.adjusted': WalletData;
}

export type NotificationEvent = {
  [K in NotificationEventType]: {
    eventId: string;
    eventType: K;
    eventVersion: 1;
    source: string;
    occurredAt: string;
    correlationId?: string;
    data: EventDataMap[K];
  };
}[NotificationEventType];

export class PermanentEventError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const bid = ['bidId', 'requestId', 'customerId'];
const proposal = ['proposalId', 'requestId', 'customerId', 'workerId'];
const order = ['orderId', 'customerId', 'workerId'];
const wallet = ['walletOwnerId', 'transactionId'];
export const EVENT_CONTRACTS = {
  'matching.eligible_workers.ready': {
    source: 'matching-service',
    ids: ['requestId', 'matchingRunId', 'chunkId'],
  },
  'bid.submitted': { source: 'bidding-service', ids: bid },
  'bid.revised': { source: 'bidding-service', ids: bid },
  'booking_proposal.created': { source: 'order-service', ids: proposal },
  'booking_proposal.changes_requested': {
    source: 'order-service',
    ids: proposal,
  },
  'booking_proposal.rejected': { source: 'order-service', ids: proposal },
  'order.created': { source: 'order-service', ids: order },
  'order.status.changed': { source: 'order-service', ids: order },
  'order.cancelled': { source: 'order-service', ids: order },
  'order.completed': { source: 'order-service', ids: order },
  'payment.succeeded': {
    source: 'payment-service',
    ids: ['paymentId', 'payerId'],
  },
  'payment.failed': {
    source: 'payment-service',
    ids: ['paymentId', 'payerId'],
  },
  'payment.refunded': {
    source: 'payment-service',
    ids: ['paymentId', 'refundId', 'recipientId'],
  },
  'wallet.credited': { source: 'wallet-service', ids: wallet },
  'wallet.debited': { source: 'wallet-service', ids: wallet },
  'wallet.balance.adjusted': { source: 'wallet-service', ids: wallet },
} satisfies Record<NotificationEventType, { source: string; ids: string[] }>;

export const MAX_EVENT_BYTES = 128 * 1024;
export const MAX_MATCHING_RECIPIENTS = 500;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Accept the existing Nest packet, or a raw envelope. Never infer identity. */
export function validateNotificationEvent(
  input: unknown,
  routingKey?: string,
): NotificationEvent {
  if (!isRecord(input)) throw new PermanentEventError('INVALID_ENVELOPE');
  let envelope = input;
  if ('pattern' in input) {
    if (typeof input.pattern !== 'string' || !isRecord(input.data))
      throw new PermanentEventError('INVALID_PACKET');
    if (routingKey && routingKey !== input.pattern)
      throw new PermanentEventError('ROUTING_MISMATCH');
    routingKey = input.pattern;
    envelope = input.data;
  }
  const type =
    envelope.eventType === undefined ? routingKey : envelope.eventType;
  if (
    typeof type !== 'string' ||
    !NOTIFICATION_EVENTS.includes(type as NotificationEventType)
  )
    throw new PermanentEventError('UNSUPPORTED_EVENT');
  if (routingKey && routingKey !== type)
    throw new PermanentEventError('ROUTING_MISMATCH');
  const contract = EVENT_CONTRACTS[type as NotificationEventType];
  const source =
    envelope.source === undefined
      ? (envelope.sourceService === undefined ? envelope.producer : envelope.sourceService)
      : envelope.source;
  const version =
    envelope.eventVersion === undefined
      ? (envelope.version === undefined ? 1 : envelope.version)
      : envelope.eventVersion;
  const rawData =
    envelope.data !== undefined ? envelope.data : envelope.payload;

  if (
    version !== 1 ||
    (envelope.version !== undefined && envelope.version !== version) ||
    (envelope.eventVersion !== undefined && envelope.eventVersion !== version)
  )
    throw new PermanentEventError('UNSUPPORTED_VERSION');
  if (
    typeof envelope.eventId !== 'string' ||
    !isUUID(envelope.eventId) ||
    source !== contract.source ||
    (envelope.producer !== undefined && envelope.producer !== source) ||
    (envelope.sourceService !== undefined && envelope.sourceService !== source) ||
    typeof envelope.occurredAt !== 'string' ||
    !isISO8601(envelope.occurredAt, { strict: true, strictSeparator: true }) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(envelope.occurredAt) ||
    (envelope.correlationId !== undefined &&
      (typeof envelope.correlationId !== 'string' ||
        !/^[\w.:-]{1,128}$/.test(envelope.correlationId))) ||
    !isRecord(rawData)
  )
    throw new PermanentEventError('INVALID_ENVELOPE');

  const resolveField = (
    record: Record<string, unknown>,
    field: string,
  ): unknown => {
    if (record[field] !== undefined) return record[field];
    if (field === 'requestId') return record.serviceRequestId;
    if (field === 'customerId') return record.customerUserId;
    if (field === 'workerId') return record.workerUserId;
    if (field === 'matchingRunId') return record.matchRunId;
    if (field === 'walletOwnerId') return record.userId ?? record.ownerId;
    return undefined;
  };

  const data: Record<string, unknown> = {};
  for (const field of contract.ids) {
    const value = resolveField(rawData, field);
    if (typeof value !== 'string' || !isUUID(value))
      throw new PermanentEventError('INVALID_REQUIRED_ID');
    data[field] = value.toLowerCase();
  }
  if (type === 'matching.eligible_workers.ready') {
    let ids = rawData.eligibleWorkerIds;
    if (!ids && Array.isArray(rawData.eligibleWorkers)) {
      ids = rawData.eligibleWorkers.map((w: unknown) =>
        typeof w === 'string'
          ? w
          : isRecord(w)
            ? (w.workerId ?? w.userId ?? w.id)
            : undefined,
      );
    }
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > MAX_MATCHING_RECIPIENTS ||
      ids.some((id) => typeof id !== 'string' || !isUUID(id))
    )
      throw new PermanentEventError('INVALID_RECIPIENT_BATCH');
    data.eligibleWorkerIds = [
      ...new Set(ids.map((id: string) => id.toLowerCase())),
    ];
  }
  if (type === 'order.status.changed') {
    for (const field of ['previousStatus', 'nextStatus']) {
      const status = rawData[field];
      if (
        typeof status !== 'string' ||
        !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(status)
      )
        throw new PermanentEventError('INVALID_TRANSITION');
      data[field] = status;
    }
    if (
      typeof rawData.notificationKind !== 'string' ||
      !['status_update', 'completed', 'cancelled'].includes(
        rawData.notificationKind,
      )
    )
      throw new PermanentEventError('INVALID_TRANSITION_KIND');
    data.notificationKind = rawData.notificationKind;
  }
  if (type.startsWith('wallet.')) {
    if (typeof rawData.reason === 'string') data.reason = rawData.reason;
    if (typeof rawData.paymentId === 'string') data.paymentId = rawData.paymentId;
    if (typeof rawData.orderId === 'string') data.orderId = rawData.orderId;
    if (typeof rawData.referenceType === 'string')
      data.referenceType = rawData.referenceType;
  }
  // Whitelist metadata; unknown business fields and secrets never reach storage/logs.
  return {
    eventId: envelope.eventId.toLowerCase(),
    eventType: type,
    eventVersion: 1,
    source: contract.source,
    occurredAt: envelope.occurredAt,
    ...(envelope.correlationId
      ? { correlationId: envelope.correlationId }
      : {}),
    data,
  } as NotificationEvent;
}
