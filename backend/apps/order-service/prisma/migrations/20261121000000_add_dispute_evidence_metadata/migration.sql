ALTER TABLE "order_service"."order_evidences"
  ADD COLUMN "evidence_type" VARCHAR(30) NOT NULL DEFAULT 'work',
  ADD COLUMN "submitted_by_user_id" UUID;
