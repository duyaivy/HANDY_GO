-- AlterTable: worker_service_registrations (add version column with default 1)
ALTER TABLE "worker_service_registrations" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

