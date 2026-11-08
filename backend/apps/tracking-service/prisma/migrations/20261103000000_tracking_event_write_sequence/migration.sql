ALTER TABLE "tracking_service"."tracking_flows"
ADD COLUMN "event_sequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tracking_service"."tracking_events"
ADD COLUMN "write_sequence" INTEGER;

WITH "ranked_events" AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "tracking_flow_id"
            ORDER BY "recorded_at" ASC, "id" ASC
        )::INTEGER AS "write_sequence"
    FROM "tracking_service"."tracking_events"
)
UPDATE "tracking_service"."tracking_events" AS "event"
SET "write_sequence" = "ranked_events"."write_sequence"
FROM "ranked_events"
WHERE "event"."id" = "ranked_events"."id";

UPDATE "tracking_service"."tracking_flows" AS "flow"
SET "event_sequence" = COALESCE(
    (
        SELECT MAX("event"."write_sequence")
        FROM "tracking_service"."tracking_events" AS "event"
        WHERE "event"."tracking_flow_id" = "flow"."id"
    ),
    0
);

ALTER TABLE "tracking_service"."tracking_events"
ALTER COLUMN "write_sequence" SET NOT NULL;

CREATE UNIQUE INDEX "tracking_events_tracking_flow_id_write_sequence_key"
ON "tracking_service"."tracking_events"("tracking_flow_id", "write_sequence");
