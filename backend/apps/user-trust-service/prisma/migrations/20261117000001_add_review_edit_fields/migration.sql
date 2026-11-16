-- AlterTable
ALTER TABLE "user_trust_service"."worker_reviews"
  ADD COLUMN IF NOT EXISTS "is_edited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMPTZ(6);
