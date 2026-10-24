-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "order_service";

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('draft', 'open_for_bidding', 'bidding_closed', 'converted_to_order', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "BookingProposalStatus" AS ENUM ('proposed', 'changes_requested', 'worker_rejected', 'withdrawn', 'expired', 'finalized', 'superseded');

-- CreateEnum
CREATE TYPE "WorkerSelectionSource" AS ENUM ('bid', 'recommendation');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('created', 'confirmed', 'in_progress', 'awaiting_customer_confirmation', 'completed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('unpaid', 'pending', 'paid', 'refunded', 'failed');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "request_code" VARCHAR(30) NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "service_id" UUID,
    "description" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "ai_reference_price_min" DECIMAL(12,2),
    "ai_reference_price_max" DECIMAL(12,2),
    "address_text" VARCHAR(500),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "RequestStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "bidding_closes_at" TIMESTAMPTZ(6),
    "selection_expires_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "matching_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_media" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "media_type" VARCHAR(30) NOT NULL,
    "media_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_proposals" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "supersedes_proposal_id" UUID,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "customer_user_id" UUID NOT NULL,
    "worker_user_id" UUID NOT NULL,
    "selection_source" "WorkerSelectionSource" NOT NULL,
    "source_bid_id" UUID,
    "source_match_result_id" UUID,
    "agreed_price" DECIMAL(12,2) NOT NULL,
    "agreed_scope" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6),
    "status" "BookingProposalStatus" NOT NULL DEFAULT 'proposed',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "worker_responded_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "response_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_code" VARCHAR(30) NOT NULL,
    "service_request_id" UUID NOT NULL,
    "booking_proposal_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "worker_user_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "selection_source" "WorkerSelectionSource" NOT NULL,
    "selected_bid_id" UUID,
    "selected_match_result_id" UUID,
    "agreed_price" DECIMAL(12,2) NOT NULL,
    "agreed_scope" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6),
    "address_text" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'created',
    "payment_state" "PaymentState" NOT NULL DEFAULT 'unpaid',
    "confirmed_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "worker_finished_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "disputed_at" TIMESTAMPTZ(6),
    "dispute_reason" TEXT,
    "dispute_previous_status" "OrderStatus",
    "dispute_resolved_at" TIMESTAMPTZ(6),
    "dispute_resolution_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_evidences" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "media_type" VARCHAR(30) NOT NULL,
    "media_url" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_by_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
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
CREATE TABLE "consumed_events" (
    "event_id" VARCHAR(100) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_request_code_key" ON "service_requests"("request_code");

-- CreateIndex
CREATE INDEX "service_requests_customer_user_id_status_created_at_idx" ON "service_requests"("customer_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "service_requests_service_id_status_idx" ON "service_requests"("service_id", "status");

-- CreateIndex
CREATE INDEX "request_media_service_request_id_idx" ON "request_media"("service_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_proposals_supersedes_proposal_id_key" ON "booking_proposals"("supersedes_proposal_id");

-- CreateIndex
CREATE INDEX "booking_proposals_service_request_id_status_idx" ON "booking_proposals"("service_request_id", "status");

-- CreateIndex
CREATE INDEX "booking_proposals_worker_user_id_status_idx" ON "booking_proposals"("worker_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_service_request_id_key" ON "orders"("service_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_booking_proposal_id_key" ON "orders"("booking_proposal_id");

-- CreateIndex
CREATE INDEX "orders_customer_user_id_status_created_at_idx" ON "orders"("customer_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_worker_user_id_status_created_at_idx" ON "orders"("worker_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "order_evidences_order_id_idx" ON "order_evidences"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "outbox_events"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- AddForeignKey
ALTER TABLE "request_media" ADD CONSTRAINT "request_media_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_proposals" ADD CONSTRAINT "booking_proposals_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_proposals" ADD CONSTRAINT "booking_proposals_supersedes_proposal_id_fkey" FOREIGN KEY ("supersedes_proposal_id") REFERENCES "booking_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_booking_proposal_id_fkey" FOREIGN KEY ("booking_proposal_id") REFERENCES "booking_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_evidences" ADD CONSTRAINT "order_evidences_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
