CREATE INDEX "bids_submitted_at_worker_id_idx"
ON "bidding_service"."bids"("submitted_at", "worker_id");

CREATE INDEX "bid_revisions_revised_at_bid_id_idx"
ON "bidding_service"."bid_revisions"("revised_at", "bid_id");
