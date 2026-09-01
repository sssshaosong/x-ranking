-- X Radar schema. Runtime also creates these tables automatically, so dashboard users do not need to paste SQL manually.
-- Legacy multi-source tables are intentionally not dropped; they are no longer read by the Worker.

CREATE TABLE IF NOT EXISTS x_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL DEFAULT 10,
  last_scheduled_at INTEGER NOT NULL DEFAULT 0,
  woeid INTEGER NOT NULL DEFAULT 1,
  max_trends INTEGER NOT NULL DEFAULT 20,
  spike_ratio REAL NOT NULL DEFAULT 2.0,
  spike_min_posts INTEGER NOT NULL DEFAULT 20,
  posts_per_rule INTEGER NOT NULL DEFAULT 10
);
INSERT OR IGNORE INTO x_settings
  (id, enabled, interval_minutes, last_scheduled_at, woeid, max_trends, spike_ratio, spike_min_posts, posts_per_rule)
VALUES (1, 1, 10, 0, 1, 20, 2.0, 20, 10);

CREATE TABLE IF NOT EXISTS x_trend_snapshots (
  woeid INTEGER NOT NULL,
  trend_name TEXT NOT NULL,
  ts INTEGER NOT NULL,
  tweet_count INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL,
  PRIMARY KEY (woeid, trend_name, ts)
);
CREATE INDEX IF NOT EXISTS idx_x_trend_latest ON x_trend_snapshots (woeid, ts DESC, rank);

CREATE TABLE IF NOT EXISTS x_watch_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('keyword','account')),
  label TEXT NOT NULL,
  query TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS x_rule_snapshots (
  rule_id INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  count_5m INTEGER NOT NULL DEFAULT 0,
  previous_5m INTEGER NOT NULL DEFAULT 0,
  count_15m INTEGER NOT NULL DEFAULT 0,
  count_60m INTEGER NOT NULL DEFAULT 0,
  ratio_5m REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (rule_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_x_rule_latest ON x_rule_snapshots (rule_id, ts DESC);

CREATE TABLE IF NOT EXISTS x_posts (
  post_id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT,
  fetched_at INTEGER NOT NULL,
  author_id TEXT,
  author_name TEXT,
  username TEXT,
  profile_image_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  repost_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  impression_count INTEGER NOT NULL DEFAULT 0,
  engagement REAL NOT NULL DEFAULT 0,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_x_posts_fetched ON x_posts (fetched_at DESC, engagement DESC);

CREATE TABLE IF NOT EXISTS x_rule_posts (
  rule_id INTEGER NOT NULL,
  post_id TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (rule_id, post_id)
);

CREATE TABLE IF NOT EXISTS x_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  ratio REAL NOT NULL DEFAULT 0,
  detail TEXT,
  url TEXT,
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_x_alerts_recent ON x_alerts (ts DESC);

CREATE TABLE IF NOT EXISTS x_runs (
  ts INTEGER PRIMARY KEY,
  trends INTEGER NOT NULL DEFAULT 0,
  rules INTEGER NOT NULL DEFAULT 0,
  posts INTEGER NOT NULL DEFAULT 0,
  alerts INTEGER NOT NULL DEFAULT 0,
  notified INTEGER NOT NULL DEFAULT 0,
  errors TEXT
);
