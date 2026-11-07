-- AlterTable: Add idempotency_key column
ALTER TABLE "worker_service_registrations" ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128);

-- CreateIndex: unique idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS "worker_service_registrations_idempotency_key_key" 
ON "worker_service_registrations"("idempotency_key");

-- CreateIndex: partial unique index for single pending registration per worker
CREATE UNIQUE INDEX IF NOT EXISTS "worker_service_registrations_single_pending_idx" 
ON "worker_service_registrations"("worker_profile_id") 
WHERE status = 'pending';

