-- Enum: match_run_status
CREATE TYPE "match_run_status" AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- Table: match_runs
CREATE TABLE "match_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service_request_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "request_revision" INTEGER NOT NULL DEFAULT 1,
  "run_number" INTEGER NOT NULL DEFAULT 1,
  "status" "match_run_status" NOT NULL DEFAULT 'pending',
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "result_count" INTEGER NOT NULL DEFAULT 0,
  "display_limit" INTEGER NOT NULL DEFAULT 5,
  "model_version" VARCHAR(100),
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),

  CONSTRAINT "match_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_runs_service_request_revision_run_key" UNIQUE ("service_request_id", "request_revision", "run_number"),
  CONSTRAINT "match_runs_request_revision_check" CHECK ("request_revision" > 0),
  CONSTRAINT "match_runs_run_number_check" CHECK ("run_number" > 0),
  CONSTRAINT "match_runs_candidate_count_check" CHECK ("candidate_count" >= 0),
  CONSTRAINT "match_runs_result_count_check" CHECK ("result_count" >= 0),
  CONSTRAINT "match_runs_display_limit_check" CHECK ("display_limit" > 0)
);

CREATE INDEX "match_runs_request_status_created_idx" ON "match_runs"("service_request_id", "status", "created_at");

-- Table: match_results
CREATE TABLE "match_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "match_run_id" UUID NOT NULL,
  "worker_user_id" UUID NOT NULL,
  "rank" INTEGER NOT NULL,
  "matching_score" DECIMAL(5,2) NOT NULL,
  "score_breakdown" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_results_match_run_id_fkey" FOREIGN KEY ("match_run_id") REFERENCES "match_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_results_match_run_worker_key" UNIQUE ("match_run_id", "worker_user_id"),
  CONSTRAINT "match_results_match_run_rank_key" UNIQUE ("match_run_id", "rank"),
  CONSTRAINT "match_results_rank_check" CHECK ("rank" > 0 AND "rank" <= 20),
  CONSTRAINT "match_results_score_check" CHECK ("matching_score" >= 0.00 AND "matching_score" <= 100.00)
);

-- Table: outbox_events
CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "aggregate_type" VARCHAR(50) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  "publish_attempts" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- Table: consumed_events
CREATE TABLE "consumed_events" (
  "event_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- Comments on Cross-Service Logical References
COMMENT ON TABLE "match_runs" IS 'Historical and active execution runs for AI worker recommendations';
COMMENT ON COLUMN "match_runs"."service_request_id" IS 'Logical reference -> Order Service.service_requests.id';
COMMENT ON COLUMN "match_runs"."service_id" IS 'Logical reference -> Catalog Service.services.id';
COMMENT ON COLUMN "match_runs"."request_revision" IS 'Service Request revision; prevents displaying stale recommendations';
COMMENT ON COLUMN "match_runs"."run_number" IS 'Execution sequence number for retries under the same revision';
COMMENT ON COLUMN "match_runs"."display_limit" IS 'Default UI display count (default: 5)';
COMMENT ON TABLE "match_results" IS 'Persisted top-N worker recommendations (up to Top 20) for each match run';
COMMENT ON COLUMN "match_results"."worker_user_id" IS 'Logical reference -> User & Trust Service.users.id';
COMMENT ON COLUMN "match_results"."rank" IS 'Ranking position (1 to 20)';
COMMENT ON COLUMN "match_results"."matching_score" IS 'Normalized total score from 0.00 to 100.00';
