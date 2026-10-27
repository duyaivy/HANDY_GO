-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tracking_service";

-- CreateEnum
CREATE TYPE "tracking_service"."tracking_entity_type" AS ENUM (
    'service_request',
    'bid',
    'bidding_round',
    'matching',
    'booking_proposal',
    'order',
    'payment'
);

-- CreateTable
CREATE TABLE "tracking_service"."tracking_flows" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "order_id" UUID,
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracking_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_service"."tracking_events" (
    "id" UUID NOT NULL,
    "tracking_flow_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "entity_type" "tracking_service"."tracking_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "source_service" VARCHAR(100) NOT NULL,
    "aggregate_version" INTEGER,
    "from_status" VARCHAR(50),
    "to_status" VARCHAR(50),
    "actor_user_id" UUID,
    "reason" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_service"."consumed_events" (
    "event_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracking_flows_service_request_id_key" ON "tracking_service"."tracking_flows"("service_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_flows_order_id_key" ON "tracking_service"."tracking_flows"("order_id");

-- CreateIndex
CREATE INDEX "tracking_flows_order_id_idx" ON "tracking_service"."tracking_flows"("order_id");

-- CreateIndex
CREATE INDEX "tracking_flows_customer_id_idx" ON "tracking_service"."tracking_flows"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_events_event_id_key" ON "tracking_service"."tracking_events"("event_id");

-- CreateIndex
CREATE INDEX "tracking_events_tracking_flow_id_occurred_at_idx" ON "tracking_service"."tracking_events"("tracking_flow_id", "occurred_at");

-- CreateIndex
CREATE INDEX "tracking_events_entity_type_entity_id_occurred_at_idx" ON "tracking_service"."tracking_events"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "tracking_events_occurred_at_idx" ON "tracking_service"."tracking_events"("occurred_at");

-- AddForeignKey
ALTER TABLE "tracking_service"."tracking_events" ADD CONSTRAINT "tracking_events_tracking_flow_id_fkey" FOREIGN KEY ("tracking_flow_id") REFERENCES "tracking_service"."tracking_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
