CREATE TABLE IF NOT EXISTS dead_letter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(200) NOT NULL UNIQUE,
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL,
  reason VARCHAR(500) NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dead_letter_events_type_created_idx ON dead_letter_events(event_type, created_at DESC);
