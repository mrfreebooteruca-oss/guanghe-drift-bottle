CREATE TABLE IF NOT EXISTS bottle_reports (
  id TEXT PRIMARY KEY,
  bottle_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bottle_id, reporter_id),
  FOREIGN KEY (bottle_id) REFERENCES bottles(id),
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bottle_reports_bottle_created
  ON bottle_reports(bottle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bottle_reports_reporter_created
  ON bottle_reports(reporter_id, created_at DESC);
