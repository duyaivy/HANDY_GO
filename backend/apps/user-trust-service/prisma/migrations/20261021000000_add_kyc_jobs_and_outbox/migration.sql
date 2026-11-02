-- CreateEnum
CREATE TYPE "ai_job_status" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "kyc_cases"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "idempotency_key" VARCHAR(128),
  ADD COLUMN "active_job_id" UUID,
  ADD COLUMN "raw_ocr_data" JSONB,
  ADD COLUMN "ai_result" JSONB;

-- CreateTable
CREATE TABLE "ai_analysis_jobs" (
  "id" UUID NOT NULL,
  "kyc_case_id" UUID NOT NULL,
  "worker_profile_id" UUID NOT NULL,
  "status" "ai_job_status" NOT NULL DEFAULT 'pending',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "max_retries" INTEGER NOT NULL DEFAULT 3,
  "idempotency_key" VARCHAR(128),
  "failure_reason" TEXT,
  "ai_result" JSONB,
  "started_at" TIMESTAMP(6),
  "completed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "ai_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_review_histories" (
  "id" UUID NOT NULL,
  "kyc_case_id" UUID NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "from_status" VARCHAR(50),
  "to_status" VARCHAR(50) NOT NULL,
  "performed_by_user_id" UUID,
  "note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kyc_review_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),

  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_analysis_jobs_idempotency_key_key" ON "ai_analysis_jobs"("idempotency_key");
CREATE INDEX "ai_analysis_jobs_kyc_case_id_idx" ON "ai_analysis_jobs"("kyc_case_id");
CREATE INDEX "ai_analysis_jobs_status_idx" ON "ai_analysis_jobs"("status");

-- CreateIndex
CREATE INDEX "kyc_review_histories_kyc_case_id_idx" ON "kyc_review_histories"("kyc_case_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextRetryAt_idx" ON "outbox_events"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "ai_analysis_jobs" ADD CONSTRAINT "ai_analysis_jobs_kyc_case_id_fkey" FOREIGN KEY ("kyc_case_id") REFERENCES "kyc_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_review_histories" ADD CONSTRAINT "kyc_review_histories_kyc_case_id_fkey" FOREIGN KEY ("kyc_case_id") REFERENCES "kyc_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
