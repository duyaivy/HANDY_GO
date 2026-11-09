-- AlterTable: worker_service_areas (add address column if not exists)
ALTER TABLE "worker_service_areas" ADD COLUMN IF NOT EXISTS "address" VARCHAR(255);

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "registration_status" AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "worker_service_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "worker_profile_id" UUID NOT NULL,
    "category_ids" JSONB NOT NULL,
    "services" JSONB NOT NULL,
    "service_area" JSONB NOT NULL,
    "evidence_files" JSONB NOT NULL,
    "status" "registration_status" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_service_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "worker_service_registrations_worker_profile_id_status_idx" ON "worker_service_registrations"("worker_profile_id", "status");
CREATE INDEX IF NOT EXISTS "worker_service_registrations_status_created_at_idx" ON "worker_service_registrations"("status", "created_at");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "worker_service_registrations" 
      ADD CONSTRAINT "worker_service_registrations_worker_profile_id_fkey" 
      FOREIGN KEY ("worker_profile_id") REFERENCES "worker_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "worker_service_registrations" 
      ADD CONSTRAINT "worker_service_registrations_reviewed_by_user_id_fkey" 
      FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

