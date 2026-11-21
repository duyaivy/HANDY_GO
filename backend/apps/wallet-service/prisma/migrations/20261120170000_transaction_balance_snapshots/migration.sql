-- Nullable historical rows retain unknown snapshots. New application postings
-- record both values atomically while holding the wallet row lock.
ALTER TABLE "wallet_service"."wallet_transactions"
  ADD COLUMN "balance_before" BIGINT,
  ADD COLUMN "balance_after" BIGINT;

ALTER TABLE "wallet_service"."wallet_transactions"
  ADD CONSTRAINT "wallet_transaction_balance_snapshots_consistent" CHECK (
    (balance_before IS NULL AND balance_after IS NULL)
    OR (
      balance_before IS NOT NULL AND balance_after IS NOT NULL
      AND direction IN ('credit', 'debit')
      AND balance_after::numeric = balance_before::numeric
        + CASE WHEN direction = 'credit' THEN amount::numeric ELSE -amount::numeric END
    )
  );
