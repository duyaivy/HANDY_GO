export interface EventEnvelope<T = any> {
  eventId?: string;
  id?: string;
  eventType?: string;
  serviceRequestId?: string;
  requestId?: string;
  orderId?: string;
  aggregateId?: string;
  aggregateVersion?: number;
  occurredAt?: string | Date;
  sourceService?: string;
  actorUserId?: string;
  fromStatus?: string;
  toStatus?: string;
  reason?: string;
  metadata?: Record<string, any>;
  payload?: T;
  [key: string]: any;
}
