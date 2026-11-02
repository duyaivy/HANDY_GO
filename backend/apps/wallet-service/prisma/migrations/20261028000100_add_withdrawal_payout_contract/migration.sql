ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS payout_operation_id UUID,
  ADD COLUMN IF NOT EXISTS payout_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_reason VARCHAR(200);
UPDATE withdrawals SET payout_operation_id = gen_random_uuid() WHERE payout_operation_id IS NULL;
ALTER TABLE withdrawals ALTER COLUMN payout_operation_id SET NOT NULL;
ALTER TABLE withdrawals ALTER COLUMN payout_operation_id SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_payout_operation_id_key ON withdrawals(payout_operation_id);
