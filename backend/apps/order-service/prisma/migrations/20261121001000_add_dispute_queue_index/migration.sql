CREATE INDEX "orders_status_disputed_at_idx"
  ON "order_service"."orders"("status", "disputed_at");
