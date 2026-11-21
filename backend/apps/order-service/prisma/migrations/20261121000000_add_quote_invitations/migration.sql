CREATE TABLE "order_service"."quote_invitations" (
    "id" UUID NOT NULL,
    "service_request_id" UUID NOT NULL,
    "worker_user_id" UUID NOT NULL,
    "source_match_result_id" UUID NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_invitations_service_request_id_fkey"
        FOREIGN KEY ("service_request_id") REFERENCES "order_service"."service_requests"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "quote_invitations_service_request_id_worker_user_id_key"
    ON "order_service"."quote_invitations"("service_request_id", "worker_user_id");
