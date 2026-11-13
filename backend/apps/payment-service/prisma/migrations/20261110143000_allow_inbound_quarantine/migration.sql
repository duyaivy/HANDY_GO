-- Preserve existing business retry states while permitting redacted delivery quarantine.
ALTER TABLE "payment_service"."failed_inbound_events"
  DROP CONSTRAINT "failed_inbound_events_status_check",
  ADD CONSTRAINT "failed_inbound_events_status_check"
    CHECK ("status" IN ('retrying', 'dead', 'quarantined'));
