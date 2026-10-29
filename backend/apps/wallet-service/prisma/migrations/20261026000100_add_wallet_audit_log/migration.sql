CREATE TABLE IF NOT EXISTS wallet_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  action VARCHAR(80) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  transfer_id UUID REFERENCES wallet_transfers(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_audit_logs_target_user_created_idx ON wallet_audit_logs(target_user_id, created_at DESC);
