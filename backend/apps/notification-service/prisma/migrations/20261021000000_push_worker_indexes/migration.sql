-- Phase 3 FCM: Partial indexes for Push Worker polling and lease recovery

CREATE INDEX IF NOT EXISTS "delivery_attempts_push_worker_poll_idx"
  ON "notification_delivery_attempts" ("created_at" ASC)
  WHERE channel = 'push'
    AND status = 'queued'
    AND (next_retry_at IS NULL OR next_retry_at <= NOW());

CREATE INDEX IF NOT EXISTS "delivery_attempts_push_processing_idx"
  ON "notification_delivery_attempts" ("attempted_at" ASC)
  WHERE channel = 'push'
    AND status = 'processing';
