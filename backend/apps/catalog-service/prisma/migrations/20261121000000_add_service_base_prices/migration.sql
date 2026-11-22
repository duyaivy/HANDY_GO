-- AlterTable
ALTER TABLE "catalog_service"."services"
ADD COLUMN IF NOT EXISTS "base_price_min" DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS "base_price_max" DECIMAL(12,2);
