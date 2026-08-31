-- 建表：wrangler d1 execute trend-radar-db --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS items (
  source     TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  title      TEXT,
  url        TEXT,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  PRIMARY KEY (source, item_id)
);

-- 时间序列：判定异动的唯一依据，定期清理旧数据
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

-- 跑批日志，状态页用
CREATE TABLE IF NOT EXISTS runs (
  ts        INTEGER PRIMARY KEY,
  polled    INTEGER DEFAULT 0,
  inserted  INTEGER DEFAULT 0,
  alerts    INTEGER DEFAULT 0,
  notified  INTEGER DEFAULT 0,
  errors    TEXT
);
