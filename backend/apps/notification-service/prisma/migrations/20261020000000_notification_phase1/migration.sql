-- Prisma Migrate creates and selects the schema from the connection URL.
-- Default: notification_service (independently owned within shared Supabase).

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('push', 'in_app', 'email');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('queued', 'processing', 'sent', 'partially_sent', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('queued', 'processing', 'sent', 'delivered', 'failed', 'opened');

-- CreateEnum
CREATE TYPE "notification_category" AS ENUM ('request', 'matching', 'bidding', 'proposal', 'order', 'payment', 'wallet', 'system');

-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('android', 'ios', 'web');

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "device_platform" NOT NULL,
    "device_id" VARCHAR(255),
    "push_token" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'fcm',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "category" "notification_category" NOT NULL,
    "source_service" VARCHAR(80) NOT NULL,
    "source_entity_id" UUID,
    "service_request_id" UUID,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "status" "notification_status" NOT NULL DEFAULT 'queued',
    "read_at" TIMESTAMPTZ(3),
    "scheduled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_attempts" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "device_token_id" UUID,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "delivery_attempt_key" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(50),
    "provider_message_id" VARCHAR(255),
    "status" "delivery_status" NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "next_retry_at" TIMESTAMPTZ(3),
    "attempted_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_push_token_key" ON "device_tokens"("push_token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_is_active_idx" ON "device_tokens"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_user_id_device_id_key" ON "device_tokens"("user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_id_idx" ON "notifications"("recipient_user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_created_at_id_idx" ON "notifications"("recipient_user_id", "read_at", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_source_event_id_idx" ON "notifications"("source_event_id");

-- CreateIndex
CREATE INDEX "notifications_service_request_id_created_at_idx" ON "notifications"("service_request_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_attempts_delivery_attempt_key_key" ON "notification_delivery_attempts"("delivery_attempt_key");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_notification_id_channel_idx" ON "notification_delivery_attempts"("notification_id", "channel");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_status_next_retry_at_idx" ON "notification_delivery_attempts"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_device_token_id_created_at_idx" ON "notification_delivery_attempts"("device_token_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_device_token_id_fkey" FOREIGN KEY ("device_token_id") REFERENCES "device_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DBML guards: preserve the future delivery contract without implementing delivery.
ALTER TABLE "notification_delivery_attempts"
    ADD CONSTRAINT "delivery_attempt_no_positive" CHECK ("attempt_no" >= 1),
    ADD CONSTRAINT "delivery_channel_device_consistency" CHECK (
        ("channel" = 'push' AND "device_token_id" IS NOT NULL)
        OR ("channel" IN ('in_app', 'email') AND "device_token_id" IS NULL)
    );
