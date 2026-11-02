-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bidding_service";

-- CreateEnum
CREATE TYPE "bidding_service"."bidding_round_status" AS ENUM ('pending', 'open', 'closed', 'no_bid', 'finalized', 'cancelled');

-- CreateEnum
CREATE TYPE "bidding_service"."bid_status" AS ENUM ('active', 'withdrawn', 'expired', 'selected', 'rejected');

-- CreateTable
CREATE TABLE "bidding_service"."bidding_rounds" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "status" "bidding_service"."bidding_round_status" NOT NULL DEFAULT 'open',
    "opens_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "bid_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bidding_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidding_service"."bids" (
    "id" UUID NOT NULL,
    "bidding_round_id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "message" TEXT,
    "valid_until" TIMESTAMPTZ(6),
    "status" "bidding_service"."bid_status" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidding_service"."bid_revisions" (
    "id" UUID NOT NULL,
    "bid_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "previous_amount" DECIMAL(12,2) NOT NULL,
    "new_amount" DECIMAL(12,2) NOT NULL,
    "previous_message" TEXT,
    "new_message" TEXT,
    "revised_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidding_service"."outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL DEFAULT 'bidding',
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bidding_service"."consumed_events" (
    "event_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bidding_rounds_service_request_id_key" ON "bidding_service"."bidding_rounds"("service_request_id");

-- CreateIndex
CREATE INDEX "bidding_rounds_status_closes_at_idx" ON "bidding_service"."bidding_rounds"("status", "closes_at");

-- CreateIndex
CREATE INDEX "bids_service_request_id_status_idx" ON "bidding_service"."bids"("service_request_id", "status");

-- CreateIndex
CREATE INDEX "bids_worker_id_idx" ON "bidding_service"."bids"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "bids_bidding_round_id_worker_id_key" ON "bidding_service"."bids"("bidding_round_id", "worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "bid_revisions_bid_id_revision_no_key" ON "bidding_service"."bid_revisions"("bid_id", "revision_no");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "bidding_service"."outbox_events"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "bidding_service"."outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "bidding_service"."bids" ADD CONSTRAINT "bids_bidding_round_id_fkey" FOREIGN KEY ("bidding_round_id") REFERENCES "bidding_service"."bidding_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bidding_service"."bid_revisions" ADD CONSTRAINT "bid_revisions_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bidding_service"."bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;
