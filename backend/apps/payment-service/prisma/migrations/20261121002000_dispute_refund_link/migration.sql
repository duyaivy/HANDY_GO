ALTER TABLE "payment_service"."refunds" ADD COLUMN "dispute_resolution_id" UUID;
CREATE UNIQUE INDEX "refunds_dispute_resolution_id_key" ON "payment_service"."refunds"("dispute_resolution_id");
