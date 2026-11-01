ALTER TABLE "match_runs" ADD COLUMN "attempt_token" UUID,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6);

CREATE TABLE "event_deliveries" (
  "event_id" VARCHAR(200) PRIMARY KEY,
  "event_type" VARCHAR(100) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "last_error" TEXT NOT NULL,
  "dead_letter" BOOLEAN NOT NULL DEFAULT FALSE,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "service_request_projections"
  ADD COLUMN "bidding_closes_at" TIMESTAMPTZ(6),
  ADD COLUMN "selection_expires_at" TIMESTAMPTZ(6);
