PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bottles (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  game_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_key TEXT,
  image_url TEXT,
  image_mime TEXT,
  template TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'approved',
  report_count INTEGER NOT NULL DEFAULT 0,
  featured_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bottles_status_created
  ON bottles(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bottles_category_status
  ON bottles(category, status);

CREATE TABLE IF NOT EXISTS dredges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bottle_id TEXT NOT NULL,
  saved_to_wall INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, bottle_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (bottle_id) REFERENCES bottles(id)
);

CREATE INDEX IF NOT EXISTS idx_dredges_user_created
  ON dredges(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wall_slots (
  user_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot >= 1 AND slot <= 9),
  bottle_id TEXT NOT NULL,
  layout TEXT NOT NULL DEFAULT 'grid9',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, slot),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (bottle_id) REFERENCES bottles(id)
);

CREATE INDEX IF NOT EXISTS idx_wall_slots_bottle
  ON wall_slots(bottle_id);

CREATE TABLE IF NOT EXISTS daily_quotas (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  earned INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  share_count INTEGER NOT NULL DEFAULT 0,
  throw_count INTEGER NOT NULL DEFAULT 0,
  invite_count INTEGER NOT NULL DEFAULT 0,
  login_granted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, day),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  day TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_task_events_user_day
  ON task_events(user_id, day, type);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (inviter_id) REFERENCES users(id),
  FOREIGN KEY (invitee_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_events_type_created
  ON activity_events(type, created_at DESC);
