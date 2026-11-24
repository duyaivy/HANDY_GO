-- CreateTable
CREATE TABLE IF NOT EXISTS "user_trust_service"."worker_order_contributions" (
    "order_id" UUID NOT NULL,
    "worker_user_id" UUID NOT NULL,
    "has_contributed_total" BOOLEAN NOT NULL DEFAULT false,
    "has_contributed_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_order_contributions_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "worker_order_contributions_worker_user_id_idx" ON "user_trust_service"."worker_order_contributions"("worker_user_id");

