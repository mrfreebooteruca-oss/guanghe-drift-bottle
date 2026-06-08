CREATE INDEX IF NOT EXISTS idx_activity_events_created
  ON activity_events(created_at DESC);
