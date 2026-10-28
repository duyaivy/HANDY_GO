-- Table: service_request_projections
CREATE TABLE IF NOT EXISTS "service_request_projections" (
  "id" UUID NOT NULL,
  "request_code" VARCHAR(30) NOT NULL,
  "customer_user_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "description" TEXT,
  "scheduled_at" TIMESTAMPTZ(6),
  "address_text" VARCHAR(500),
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "matching_revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_request_projections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_request_projections_service_id_status_idx" ON "service_request_projections"("service_id", "status");
CREATE INDEX IF NOT EXISTS "service_request_projections_customer_user_id_idx" ON "service_request_projections"("customer_user_id");

COMMENT ON TABLE "service_request_projections" IS 'Event-driven read-model projection of service requests for worker discovery and matching';
