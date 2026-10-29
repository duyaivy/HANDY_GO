DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'withdrawal_status' AND e.enumlabel = 'processing') THEN
    ALTER TYPE withdrawal_status ADD VALUE 'processing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'withdrawal_status' AND e.enumlabel = 'needs_review') THEN
    ALTER TYPE withdrawal_status ADD VALUE 'needs_review';
  END IF;
END $$;
