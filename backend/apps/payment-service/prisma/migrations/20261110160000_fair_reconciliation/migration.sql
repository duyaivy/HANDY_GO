ALTER TABLE "payment_service"."payment_attempts" ADD COLUMN "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "payment_attempts_status_next_retry_at_id_idx" ON "payment_service"."payment_attempts" ("status", "next_retry_at", "id");
ALTER TABLE "payment_service"."commission_receivables" ADD COLUMN "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "commission_receivables_status_next_retry_at_id_idx" ON "payment_service"."commission_receivables" ("status", "next_retry_at", "id");
ALTER TABLE "payment_service"."payouts" ADD COLUMN "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "payouts_status_next_retry_at_id_idx" ON "payment_service"."payouts" ("status", "next_retry_at", "id");
