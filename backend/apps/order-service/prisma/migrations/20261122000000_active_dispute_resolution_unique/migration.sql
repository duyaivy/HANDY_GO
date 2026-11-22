ALTER TABLE "order_service"."order_dispute_resolutions"
  DROP CONSTRAINT IF EXISTS "order_dispute_resolutions_order_id_disputed_at_key";

DROP INDEX IF EXISTS "order_service"."order_dispute_resolutions_order_id_disputed_at_key";

CREATE UNIQUE INDEX "order_dispute_resolutions_active_unique"
  ON "order_service"."order_dispute_resolutions" ("order_id", "disputed_at")
  WHERE "state" <> 'superseded';

CREATE INDEX IF NOT EXISTS "order_dispute_resolutions_order_id_disputed_at_idx"
  ON "order_service"."order_dispute_resolutions" ("order_id", "disputed_at");
