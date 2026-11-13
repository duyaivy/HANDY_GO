SET search_path TO "payment_service", pg_catalog;

-- PO policy (05/11/2026): commission is configurable only between 0.00% and 30.00%; 100% is forbidden.
ALTER TABLE "commission_rules" DROP CONSTRAINT "commission_rules_rate_check";
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_rate_check" CHECK ("rate_percent" BETWEEN 0 AND 30);
ALTER TABLE "payments" DROP CONSTRAINT "payments_rate_check";
ALTER TABLE "payments" ADD CONSTRAINT "payments_rate_check" CHECK ("commission_rate_percent" BETWEEN 0 AND 30);
ALTER TABLE "payments" ADD CONSTRAINT "payments_worker_earning_positive_check" CHECK ("worker_earning" > 0);

-- Refund approval metadata. `pending` = waiting for an Admin decision; a rejection ends as `cancelled`.
ALTER TABLE "refunds"
  ADD COLUMN "approved_by_user_id" UUID,
  ADD COLUMN "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "rejected_by_user_id" UUID,
  ADD COLUMN "rejected_at" TIMESTAMPTZ(6),
  ADD COLUMN "decision_note" TEXT;
CREATE INDEX "refunds_status_created_at_idx" ON "refunds"("status", "created_at");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_decision_check" CHECK (
  ("approved_by_user_id" IS NULL OR "rejected_by_user_id" IS NULL)
  AND (("approved_by_user_id" IS NULL) = ("approved_at" IS NULL))
  AND (("rejected_by_user_id" IS NULL) = ("rejected_at" IS NULL))
  AND ("rejected_by_user_id" IS NULL OR "status" = 'cancelled')
  AND (("approved_by_user_id" IS NULL AND "rejected_by_user_id" IS NULL) OR coalesce(length(btrim("decision_note")), 0) > 0)
  AND ("status" NOT IN ('processing', 'completed') OR "approved_by_user_id" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(200) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_audit_logs_entity_idx" ON "admin_audit_logs"("entity_type", "entity_id", "created_at");
CREATE INDEX "admin_audit_logs_actor_idx" ON "admin_audit_logs"("actor_user_id", "created_at");

-- CreateTable
CREATE TABLE "daily_reconciliation_reports" (
    "report_date" DATE NOT NULL,
    "summary" JSONB NOT NULL,
    "discrepancy_count" INTEGER NOT NULL DEFAULT 0,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_reconciliation_reports_pkey" PRIMARY KEY ("report_date")
);
