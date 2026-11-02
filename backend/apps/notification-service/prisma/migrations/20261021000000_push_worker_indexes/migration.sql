-- Phase 3 FCM: Partial indexes for Push Worker polling and lease recovery

CREATE INDEX IF NOT EXISTS "delivery_attempts_push_worker_poll_idx"
  ON "notification_delivery_attempts" ("next_retry_at" ASC, "created_at" ASC)
  WHERE channel = 'push'
    AND status = 'queued';

CREATE INDEX IF NOT EXISTS "delivery_attempts_push_processing_idx"
  ON "notification_delivery_attempts" ("attempted_at" ASC)
  WHERE channel = 'push'
    AND status = 'processing';

