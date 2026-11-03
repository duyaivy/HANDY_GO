CREATE UNIQUE INDEX wallet_transactions_topup_reference_unique
ON wallet_transactions(type, reference_id)
WHERE type = 'topup' AND reference_id IS NOT NULL;
