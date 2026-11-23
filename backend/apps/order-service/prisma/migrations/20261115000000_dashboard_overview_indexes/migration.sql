CREATE INDEX "orders_created_at_idx"
ON "order_service"."orders"("created_at");

CREATE INDEX "orders_status_completed_at_idx"
ON "order_service"."orders"("status", "completed_at");
