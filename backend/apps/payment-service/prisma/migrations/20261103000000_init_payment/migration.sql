-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "payment_service";

SET search_path TO "payment_service", pg_catalog;

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'point');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'partially_refunded', 'refunded');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "settlement_status" AS ENUM ('pending', 'processing', 'settled', 'receivable', 'failed');

-- CreateEnum
CREATE TYPE "commission_receivable_status" AS ENUM ('due', 'partially_collected', 'collected', 'waived');

-- CreateEnum
CREATE TYPE "topup_status" AS ENUM ('pending', 'awaiting_payment', 'paid', 'credit_pending', 'completed', 'failed', 'cancelled', 'expired', 'needs_review');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'needs_review');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'needs_review');

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_user_id" UUID NOT NULL,
    "worker_user_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "method" "payment_method",
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "commission_rule_id" UUID NOT NULL,
    "commission_rate_percent" DECIMAL(5,2) NOT NULL,
    "platform_fee" BIGINT NOT NULL,
    "worker_earning" BIGINT NOT NULL,
    "order_completed_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "cash_confirmed_by_user_id" UUID,
    "failure_reason" TEXT,
    "idempotency_key" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "method" "payment_method" NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_reference" VARCHAR(150),
    "status" "attempt_status" NOT NULL DEFAULT 'pending',
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_settlements" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" "settlement_status" NOT NULL DEFAULT 'pending',
    "gross_amount" BIGINT NOT NULL,
    "platform_fee" BIGINT NOT NULL,
    "worker_earning" BIGINT NOT NULL,
    "wallet_transfer_id" UUID,
    "settled_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_receivables" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "worker_user_id" UUID NOT NULL,
    "amount_due" BIGINT NOT NULL,
    "amount_collected" BIGINT NOT NULL DEFAULT 0,
    "status" "commission_receivable_status" NOT NULL DEFAULT 'due',
    "latest_wallet_transfer_id" UUID,
    "waived_by_user_id" UUID,
    "waived_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commission_receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topup_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "points_to_credit" BIGINT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "status" "topup_status" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(150) NOT NULL,
    "provider_transaction_ref" VARCHAR(150),
    "provider_payment_ref" VARCHAR(150),
    "checkout_url" TEXT,
    "provider_paid_at" TIMESTAMPTZ(6),
    "wallet_credited_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topup_attempts" (
    "id" UUID NOT NULL,
    "topup_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_transaction_ref" VARCHAR(150) NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'pending',
    "checkout_url" TEXT,
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "topup_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_notifications" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "event_key" VARCHAR(200) NOT NULL,
    "notification_type" VARCHAR(50) NOT NULL,
    "signature_valid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "related_topup_id" UUID,
    "processed_at" TIMESTAMPTZ(6),
    "processing_error" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "withdrawal_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "bank_account_snapshot" JSONB NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'mock',
    "is_simulated" BOOLEAN NOT NULL DEFAULT true,
    "status" "payout_status" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(150) NOT NULL,
    "provider_reference" VARCHAR(150),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_attempts" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'pending',
    "provider_reference" VARCHAR(150),
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "requested_by_user_id" UUID,
    "amount_vnd" BIGINT NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "idempotency_key" VARCHAR(150) NOT NULL,
    "wallet_transfer_id" UUID,
    "provider_refund_id" VARCHAR(150),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refunded_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumed_events" (
    "event_id" VARCHAR(200) NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "commission_rules_is_active_effective_from_idx" ON "commission_rules"("is_active", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_customer_user_id_status_created_at_idx" ON "payments"("customer_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "payments_worker_user_id_status_created_at_idx" ON "payments"("worker_user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_payment_id_attempt_no_key" ON "payment_attempts"("payment_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "payment_settlements_payment_id_key" ON "payment_settlements"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_settlements_wallet_transfer_id_key" ON "payment_settlements"("wallet_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_receivables_payment_id_key" ON "commission_receivables"("payment_id");

-- CreateIndex
CREATE INDEX "commission_receivables_worker_user_id_status_created_at_idx" ON "commission_receivables"("worker_user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "topup_requests_idempotency_key_key" ON "topup_requests"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "topup_requests_provider_transaction_ref_key" ON "topup_requests"("provider_transaction_ref");

-- CreateIndex
CREATE INDEX "topup_requests_user_id_created_at_idx" ON "topup_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "topup_requests_status_created_at_idx" ON "topup_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "topup_attempts_provider_transaction_ref_key" ON "topup_attempts"("provider_transaction_ref");

-- CreateIndex
CREATE UNIQUE INDEX "topup_attempts_topup_id_attempt_no_key" ON "topup_attempts"("topup_id", "attempt_no");

-- CreateIndex
CREATE INDEX "provider_notifications_received_at_idx" ON "provider_notifications"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_notifications_provider_event_key_key" ON "provider_notifications"("provider", "event_key");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_withdrawal_id_key" ON "payouts"("withdrawal_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotency_key_key" ON "payouts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_provider_reference_key" ON "payouts"("provider_reference");

-- CreateIndex
CREATE INDEX "payouts_user_id_status_created_at_idx" ON "payouts"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_attempts_payout_id_attempt_no_key" ON "payout_attempts"("payout_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_payment_id_created_at_idx" ON "refunds"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_retry_at_created_at_idx" ON "outbox_events"("status", "next_retry_at", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_commission_rule_id_fkey" FOREIGN KEY ("commission_rule_id") REFERENCES "commission_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_receivables" ADD CONSTRAINT "commission_receivables_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_attempts" ADD CONSTRAINT "topup_attempts_topup_id_fkey" FOREIGN KEY ("topup_id") REFERENCES "topup_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_notifications" ADD CONSTRAINT "provider_notifications_related_topup_id_fkey" FOREIGN KEY ("related_topup_id") REFERENCES "topup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL guards not expressible in Prisma's schema.
ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_rate_check" CHECK ("rate_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "commission_rules_interval_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from"),
  ADD CONSTRAINT "commission_rules_no_overlap" EXCLUDE USING gist (
    tstzrange("effective_from", "effective_to", '[)') WITH &&
  ) WHERE ("is_active");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_rate_check" CHECK ("commission_rate_percent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "payments_allocation_check" CHECK (
    "platform_fee" >= 0 AND "worker_earning" >= 0 AND
    "platform_fee"::numeric + "worker_earning"::numeric = "amount"::numeric
  );

ALTER TABLE "payment_settlements"
  ADD CONSTRAINT "payment_settlements_allocation_check" CHECK (
    "gross_amount" > 0 AND "platform_fee" >= 0 AND "worker_earning" >= 0 AND
    "platform_fee"::numeric + "worker_earning"::numeric = "gross_amount"::numeric
  );

ALTER TABLE "commission_receivables"
  ADD CONSTRAINT "commission_receivables_amount_check" CHECK (
    "amount_due" >= 0 AND "amount_collected" >= 0 AND "amount_collected" <= "amount_due"
  );
ALTER TABLE "topup_requests"
  ADD CONSTRAINT "topup_requests_amount_check" CHECK ("amount_vnd" > 0 AND "points_to_credit" = "amount_vnd");
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_check" CHECK ("amount_vnd" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount_vnd" > 0);
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_number_check" CHECK ("attempt_no" > 0);
ALTER TABLE "topup_attempts" ADD CONSTRAINT "topup_attempts_number_check" CHECK ("attempt_no" > 0);
ALTER TABLE "payout_attempts" ADD CONSTRAINT "payout_attempts_number_check" CHECK ("attempt_no" > 0);
