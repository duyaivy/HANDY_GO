-- AlterTable
ALTER TABLE "bidding_service"."bidding_rounds" ADD COLUMN IF NOT EXISTS "customer_id" UUID;
