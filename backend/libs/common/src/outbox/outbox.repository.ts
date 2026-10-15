import type { OutboxEventEntity } from './outbox.types.js';

export abstract class OutboxRepository {
  /**
   * Find pending outbox events ready to be published.
   */
  abstract findPendingEvents(
    limit?: number,
    now?: Date,
  ): Promise<OutboxEventEntity[]>;

  /**
   * Mark an outbox event as successfully published.
   */
  abstract markPublished(id: string, publishedAt?: Date): Promise<void>;

  /**
   * Schedule a retry for an event with exponential backoff.
   */
  abstract scheduleRetry(
    id: string,
    nextRetryAt: Date,
    retryCount: number,
    error: string,
  ): Promise<void>;

  /**
   * Mark an event as failed after exceeding max retries and DLQ routing.
   */
  abstract markFailed(
    id: string,
    error: string,
    retryCount?: number,
  ): Promise<void>;

  /**
   * Schedule a retry for sending the event to DLQ if DLQ publishing fails.
   */
  abstract scheduleDlqRetry(
    id: string,
    nextRetryAt: Date,
    error: string,
    retryCount?: number,
  ): Promise<void>;
}
