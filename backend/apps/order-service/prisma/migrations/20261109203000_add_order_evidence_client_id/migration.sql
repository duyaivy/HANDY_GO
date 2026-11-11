-- AlterTable
ALTER TABLE "order_evidences" ADD COLUMN "client_evidence_id" VARCHAR(100);

-- CreateIndex
CREATE UNIQUE INDEX "order_evidences_order_id_client_evidence_id_key" ON "order_evidences"("order_id", "client_evidence_id");
