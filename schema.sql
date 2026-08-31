CREATE TABLE IF NOT EXISTS items (
  source     TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  title      TEXT,
  url        TEXT,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  PRIMARY KEY (source, item_id)
);

CREATE TABLE IF NOT EXISTS snapshots (
  source  TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  score   REAL,
  rank    INTEGER,
  PRIMARY KEY (source, item_id, ts)
);

CREATE TABLE IF NOT EXISTS alerts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  source  TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  kind    TEXT NOT NULL,
  ratio   REAL,
  rate    REAL,
  score   REAL
);

CREATE INDEX IF NOT EXISTS idx_alerts_recent ON alerts (source, item_id, ts);

CREATE TABLE IF NOT EXISTS runs (
  ts        INTEGER PRIMARY KEY,
  polled    INTEGER DEFAULT 0,
  inserted  INTEGER DEFAULT 0,
  alerts    INTEGER DEFAULT 0,
  notified  INTEGER DEFAULT 0,
  errors    TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  enabled           INTEGER NOT NULL DEFAULT 1,
  interval_minutes  INTEGER NOT NULL DEFAULT 20,
  last_scheduled_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO app_settings (id, enabled, interval_minutes, last_scheduled_at)
VALUES (1, 1, 20, 0);
