export type OutboxEventStatus = 'pending' | 'published' | 'failed' | 'dlq_retry';

export interface OutboxEventEntity {
  id: string;
  aggregateType?: string;
  aggregateId?: string;
  eventType: string;
  eventVersion?: number;
  payload: any;
  status: OutboxEventStatus | string;
  retryCount: number;
  nextRetryAt: Date;
  lastError?: string | null;
  createdAt?: Date;
  publishedAt?: Date | null;
}
