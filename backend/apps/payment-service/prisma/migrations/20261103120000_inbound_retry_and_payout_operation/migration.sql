SET search_path TO "payment_service", pg_catalog;

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN "payout_operation_id" UUID;

-- CreateTable
CREATE TABLE "failed_inbound_events" (
    "event_id" VARCHAR(200) NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'retrying',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "failed_inbound_events_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "failed_inbound_events_status_check" CHECK ("status" IN ('retrying', 'dead')),
    CONSTRAINT "failed_inbound_events_attempts_check" CHECK ("attempts" >= 0)
);

-- CreateIndex
CREATE INDEX "failed_inbound_events_status_next_retry_at_idx" ON "failed_inbound_events"("status", "next_retry_at");
