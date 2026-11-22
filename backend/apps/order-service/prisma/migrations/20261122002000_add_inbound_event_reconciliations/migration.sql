CREATE TABLE "order_service"."inbound_event_reconciliations" (
  "event_id" VARCHAR(100) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "order_id" UUID,
  "resolution_id" UUID,
  "classification" VARCHAR(30) NOT NULL,
  "reason_code" VARCHAR(80) NOT NULL,
  "reason_detail" TEXT NOT NULL,
  "safe_payload" JSONB NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'pending_reconciliation',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replayed_at" TIMESTAMPTZ(6),
  "replayed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "inbound_event_reconciliations_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "inbound_event_reconciliations_status_created_at_idx"
  ON "order_service"."inbound_event_reconciliations"("status", "created_at");

CREATE INDEX "inbound_event_reconciliations_order_id_status_idx"
  ON "order_service"."inbound_event_reconciliations"("order_id", "status");

CREATE INDEX "inbound_event_reconciliations_resolution_id_idx"
  ON "order_service"."inbound_event_reconciliations"("resolution_id");
