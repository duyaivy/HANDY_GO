-- Add nullable JSONB suggestion_groups column to categories and services
ALTER TABLE "catalog_service"."categories"
  ADD COLUMN IF NOT EXISTS "suggestion_groups" JSONB;

ALTER TABLE "catalog_service"."services"
  ADD COLUMN IF NOT EXISTS "suggestion_groups" JSONB;
