ALTER TYPE "order_service"."PaymentState" ADD VALUE IF NOT EXISTS 'partially_refunded';

ALTER TABLE "order_service"."orders"
  ADD COLUMN "first_completed_at" TIMESTAMPTZ(6);

UPDATE "order_service"."orders"
SET "first_completed_at" = "completed_at"
WHERE "first_completed_at" IS NULL AND "completed_at" IS NOT NULL;

CREATE TABLE "order_service"."order_dispute_resolutions" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "disputed_at" TIMESTAMPTZ(6) NOT NULL,
  "idempotency_key" VARCHAR(150) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "action" VARCHAR(30) NOT NULL,
  "resolution_note" TEXT NOT NULL,
  "state" VARCHAR(30) NOT NULL,
  "refund_amount_vnd" BIGINT,
  "payment_id" UUID,
  "refund_id" UUID,
  "previous_completed_at" TIMESTAMPTZ(6),
  "previous_worker_finished_at" TIMESTAMPTZ(6),
  "failure_code" VARCHAR(100),
  "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "order_dispute_resolutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_dispute_resolutions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order_service"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_dispute_resolutions_refund_amount_vnd_check" CHECK ("refund_amount_vnd" IS NULL OR "refund_amount_vnd" > 0)
);

CREATE UNIQUE INDEX "order_dispute_resolutions_order_id_disputed_at_key" ON "order_service"."order_dispute_resolutions"("order_id", "disputed_at");
CREATE UNIQUE INDEX "order_dispute_resolutions_idempotency_key_key" ON "order_service"."order_dispute_resolutions"("idempotency_key");
CREATE INDEX "order_dispute_resolutions_state_decided_at_idx" ON "order_service"."order_dispute_resolutions"("state", "decided_at");
