CREATE TABLE "tracking_service"."pending_tracking_events" (
 "event_id" VARCHAR(128) PRIMARY KEY, "order_id" UUID NOT NULL,
 "event_type" VARCHAR(100) NOT NULL, "envelope" JSONB NOT NULL,
 "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "last_error" VARCHAR(1000)
);
CREATE INDEX "pending_tracking_events_order_id_next_attempt_at_idx" ON "tracking_service"."pending_tracking_events" ("order_id", "next_attempt_at");
CREATE INDEX "pending_tracking_events_next_attempt_at_event_id_idx" ON "tracking_service"."pending_tracking_events" ("next_attempt_at", "event_id");
