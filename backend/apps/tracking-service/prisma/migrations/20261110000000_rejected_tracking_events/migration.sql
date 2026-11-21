CREATE TABLE "tracking_service"."rejected_tracking_events" (
  "event_id" VARCHAR(128) PRIMARY KEY,
  "event_type" VARCHAR(100) NOT NULL,
  "envelope" JSONB NOT NULL,
  "reason" VARCHAR(100) NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6)
);
CREATE INDEX "rejected_tracking_events_resolved_at_received_at_idx"
  ON "tracking_service"."rejected_tracking_events" ("resolved_at", "received_at");
