import type { AlertEvent, RunSummary, WatchRule, WatchRuleType, XPost, XSettings, XTrend } from './types';

const DEFAULTS = {
  intervalMinutes: 10,
  woeid: 1,
  maxTrends: 20,
  spikeRatio: 2,
  spikeMinPosts: 20,
  postsPerRule: 10,
};

export async function ensureSchema(env: { DB: D1Database }): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS x_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      interval_minutes INTEGER NOT NULL DEFAULT 10,
      last_scheduled_at INTEGER NOT NULL DEFAULT 0,
      woeid INTEGER NOT NULL DEFAULT 1,
      max_trends INTEGER NOT NULL DEFAULT 20,
      spike_ratio REAL NOT NULL DEFAULT 2.0,
      spike_min_posts INTEGER NOT NULL DEFAULT 20,
      posts_per_rule INTEGER NOT NULL DEFAULT 10
    )`,
    `CREATE TABLE IF NOT EXISTS x_trend_snapshots (
      woeid INTEGER NOT NULL,
      trend_name TEXT NOT NULL,
      ts INTEGER NOT NULL,
      tweet_count INTEGER NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL,
      PRIMARY KEY (woeid, trend_name, ts)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_x_trend_latest ON x_trend_snapshots (woeid, ts DESC, rank)`,
    `CREATE TABLE IF NOT EXISTS x_watch_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('keyword','account')),
      label TEXT NOT NULL,
      query TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS x_rule_snapshots (
      rule_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      count_5m INTEGER NOT NULL DEFAULT 0,
      previous_5m INTEGER NOT NULL DEFAULT 0,
      count_15m INTEGER NOT NULL DEFAULT 0,
      count_60m INTEGER NOT NULL DEFAULT 0,
      ratio_5m REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (rule_id, ts)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_x_rule_latest ON x_rule_snapshots (rule_id, ts DESC)`,
    `CREATE TABLE IF NOT EXISTS x_posts (
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
    )`,
    `CREATE TABLE IF NOT EXISTS x_rule_posts (
      rule_id INTEGER NOT NULL,
      post_id TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (rule_id, post_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_x_posts_fetched ON x_posts (fetched_at DESC, engagement DESC)`,
    `CREATE TABLE IF NOT EXISTS x_alerts (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_x_alerts_recent ON x_alerts (ts DESC)`,
    `CREATE TABLE IF NOT EXISTS x_runs (
      ts INTEGER PRIMARY KEY,
      trends INTEGER NOT NULL DEFAULT 0,
      rules INTEGER NOT NULL DEFAULT 0,
      posts INTEGER NOT NULL DEFAULT 0,
      alerts INTEGER NOT NULL DEFAULT 0,
      notified INTEGER NOT NULL DEFAULT 0,
      errors TEXT
    )`,
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO x_settings
      (id, enabled, interval_minutes, last_scheduled_at, woeid, max_trends, spike_ratio, spike_min_posts, posts_per_rule)
     VALUES (1, 1, ?, 0, ?, ?, ?, ?, ?)`
  )
    .bind(
      DEFAULTS.intervalMinutes,
      DEFAULTS.woeid,
      DEFAULTS.maxTrends,
      DEFAULTS.spikeRatio,
      DEFAULTS.spikeMinPosts,
      DEFAULTS.postsPerRule
    )
    .run();
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export async function getSettings(env: { DB: D1Database }, now = Date.now()): Promise<XSettings> {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT * FROM x_settings WHERE id = 1').first<Record<string, number>>();
  const enabled = !!row?.enabled;
  const intervalMinutes = clampInt(row?.interval_minutes, 5, 1440, DEFAULTS.intervalMinutes);
  const lastScheduledAt = Number(row?.last_scheduled_at) || 0;
  return {
    enabled,
    intervalMinutes,
    lastScheduledAt,
    nextRunAt: enabled ? (lastScheduledAt ? lastScheduledAt + intervalMinutes * 60_000 : now) : null,
    woeid: clampInt(row?.woeid, 1, 2_147_483_647, DEFAULTS.woeid),
    maxTrends: clampInt(row?.max_trends, 1, 50, DEFAULTS.maxTrends),
    spikeRatio: clampFloat(row?.spike_ratio, 1.1, 100, DEFAULTS.spikeRatio),
    spikeMinPosts: clampInt(row?.spike_min_posts, 1, 1_000_000, DEFAULTS.spikeMinPosts),
    postsPerRule: clampInt(row?.posts_per_rule, 10, 100, DEFAULTS.postsPerRule),
  };
}

export async function updateSettings(
  env: { DB: D1Database },
  patch: Partial<Omit<XSettings, 'lastScheduledAt' | 'nextRunAt'>>
): Promise<XSettings> {
  const current = await getSettings(env);
  const next = {
    enabled: patch.enabled ?? current.enabled,
    intervalMinutes: clampInt(patch.intervalMinutes ?? current.intervalMinutes, 5, 1440, current.intervalMinutes),
    woeid: clampInt(patch.woeid ?? current.woeid, 1, 2_147_483_647, current.woeid),
    maxTrends: clampInt(patch.maxTrends ?? current.maxTrends, 1, 50, current.maxTrends),
    spikeRatio: clampFloat(patch.spikeRatio ?? current.spikeRatio, 1.1, 100, current.spikeRatio),
    spikeMinPosts: clampInt(patch.spikeMinPosts ?? current.spikeMinPosts, 1, 1_000_000, current.spikeMinPosts),
    postsPerRule: clampInt(patch.postsPerRule ?? current.postsPerRule, 10, 100, current.postsPerRule),
  };
  await env.DB.prepare(
    `UPDATE x_settings SET enabled=?, interval_minutes=?, woeid=?, max_trends=?, spike_ratio=?, spike_min_posts=?, posts_per_rule=? WHERE id=1`
  )
    .bind(
      next.enabled ? 1 : 0,
      next.intervalMinutes,
      next.woeid,
      next.maxTrends,
      next.spikeRatio,
      next.spikeMinPosts,
      next.postsPerRule
    )
    .run();
  return getSettings(env);
}

export async function claimScheduledRun(env: { DB: D1Database }, now = Date.now()): Promise<boolean> {
  const settings = await getSettings(env, now);
  if (!settings.enabled) return false;
  if (settings.lastScheduledAt && now - settings.lastScheduledAt < settings.intervalMinutes * 60_000) return false;
  await env.DB.prepare('UPDATE x_settings SET last_scheduled_at=? WHERE id=1').bind(now).run();
  return true;
}

export async function listRules(env: { DB: D1Database }): Promise<WatchRule[]> {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT id,type,label,query,enabled,created_at FROM x_watch_rules ORDER BY enabled DESC, id DESC')
    .all<{ id: number; type: WatchRuleType; label: string; query: string; enabled: number; created_at: number }>();
  return (results ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    query: r.query,
    enabled: !!r.enabled,
    createdAt: r.created_at,
  }));
}

export async function addRule(env: { DB: D1Database }, type: WatchRuleType, label: string, query: string): Promise<WatchRule> {
  await ensureSchema(env);
  const cleanLabel = label.trim().slice(0, 80);
  const cleanQuery = query.trim().slice(0, 500);
  if (!cleanLabel || !cleanQuery) throw new Error('规则名称和查询内容不能为空');
  if (type !== 'keyword' && type !== 'account') throw new Error('不支持的规则类型');
  const createdAt = Date.now();
  const result = await env.DB.prepare(
    'INSERT INTO x_watch_rules (type,label,query,enabled,created_at) VALUES (?,?,?,?,?)'
  ).bind(type, cleanLabel, cleanQuery, 1, createdAt).run();
  const id = Number((result.meta as { last_row_id?: number } | undefined)?.last_row_id) || 0;
  return { id, type, label: cleanLabel, query: cleanQuery, enabled: true, createdAt };
}

export async function setRuleEnabled(env: { DB: D1Database }, id: number, enabled: boolean): Promise<void> {
  await ensureSchema(env);
  await env.DB.prepare('UPDATE x_watch_rules SET enabled=? WHERE id=?').bind(enabled ? 1 : 0, id).run();
}

export async function deleteRule(env: { DB: D1Database }, id: number): Promise<void> {
  await ensureSchema(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM x_rule_posts WHERE rule_id=?').bind(id),
    env.DB.prepare('DELETE FROM x_rule_snapshots WHERE rule_id=?').bind(id),
    env.DB.prepare('DELETE FROM x_watch_rules WHERE id=?').bind(id),
  ]);
}

export async function loadPreviousTrendCounts(env: { DB: D1Database }, woeid: number): Promise<Map<string, number>> {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT MAX(ts) AS ts FROM x_trend_snapshots WHERE woeid=?').bind(woeid).first<{ ts: number }>();
  const ts = Number(row?.ts) || 0;
  if (!ts) return new Map();
  const { results } = await env.DB.prepare('SELECT trend_name,tweet_count FROM x_trend_snapshots WHERE woeid=? AND ts=?')
    .bind(woeid, ts)
    .all<{ trend_name: string; tweet_count: number }>();
  return new Map((results ?? []).map((r) => [r.trend_name, Number(r.tweet_count) || 0]));
}

export async function saveTrends(env: { DB: D1Database }, trends: XTrend[], ts: number): Promise<void> {
  if (!trends.length) return;
  const stmts = trends.map((t) => env.DB.prepare(
    'INSERT OR REPLACE INTO x_trend_snapshots (woeid,trend_name,ts,tweet_count,rank) VALUES (?,?,?,?,?)'
  ).bind(t.woeid, t.name, ts, t.tweetCount, t.rank));
  await env.DB.batch(stmts);
}

export async function saveRuleSnapshot(
  env: { DB: D1Database },
  ruleId: number,
  ts: number,
  data: { count5m: number; previous5m: number; count15m: number; count60m: number; ratio5m: number }
): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO x_rule_snapshots
      (rule_id,ts,count_5m,previous_5m,count_15m,count_60m,ratio_5m) VALUES (?,?,?,?,?,?,?)`
  ).bind(ruleId, ts, data.count5m, data.previous5m, data.count15m, data.count60m, data.ratio5m).run();
}

export async function savePosts(env: { DB: D1Database }, ruleId: number, posts: XPost[], fetchedAt: number): Promise<void> {
  if (!posts.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (const p of posts) {
    stmts.push(env.DB.prepare(
      `INSERT INTO x_posts
        (post_id,text,created_at,fetched_at,author_id,author_name,username,profile_image_url,verified,like_count,repost_count,reply_count,quote_count,bookmark_count,impression_count,engagement,url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(post_id) DO UPDATE SET
         text=excluded.text, fetched_at=excluded.fetched_at, author_name=excluded.author_name, username=excluded.username,
         profile_image_url=excluded.profile_image_url, verified=excluded.verified, like_count=excluded.like_count,
         repost_count=excluded.repost_count, reply_count=excluded.reply_count, quote_count=excluded.quote_count,
         bookmark_count=excluded.bookmark_count, impression_count=excluded.impression_count, engagement=excluded.engagement, url=excluded.url`
    ).bind(
      p.id, p.text.slice(0, 2000), p.createdAt, fetchedAt, p.authorId, p.authorName.slice(0, 120), p.username.slice(0, 80),
      p.profileImageUrl ?? '', p.verified ? 1 : 0, p.metrics.likeCount, p.metrics.repostCount, p.metrics.replyCount,
      p.metrics.quoteCount, p.metrics.bookmarkCount, p.metrics.impressionCount, p.engagement, p.url
    ));
    stmts.push(env.DB.prepare(
      'INSERT OR REPLACE INTO x_rule_posts (rule_id,post_id,fetched_at) VALUES (?,?,?)'
    ).bind(ruleId, p.id, fetchedAt));
  }
  await env.DB.batch(stmts);
}

export async function recordAlert(env: { DB: D1Database }, alert: AlertEvent): Promise<number> {
  const result = await env.DB.prepare(
    'INSERT INTO x_alerts (ts,kind,label,subject_key,value,ratio,detail,url,notified) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(
    alert.ts, alert.kind, alert.label.slice(0, 120), alert.subjectKey.slice(0, 300), alert.value,
    alert.ratio, alert.detail.slice(0, 500), alert.url ?? '', alert.notified ? 1 : 0
  ).run();
  return Number((result.meta as { last_row_id?: number } | undefined)?.last_row_id) || 0;
}

export async function markAlertNotified(env: { DB: D1Database }, id: number): Promise<void> {
  if (!id) return;
  await env.DB.prepare('UPDATE x_alerts SET notified=1 WHERE id=?').bind(id).run();
}

export async function logRun(env: { DB: D1Database }, run: RunSummary): Promise<void> {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO x_runs (ts,trends,rules,posts,alerts,notified,errors) VALUES (?,?,?,?,?,?,?)'
  ).bind(run.ts, run.trends, run.rules, run.posts, run.alerts, run.notified, run.errors.join(' | ').slice(0, 1000)).run();
}

export async function getLatestTrends(env: { DB: D1Database }, woeid: number, limit = 50) {
  await ensureSchema(env);
  const times = await env.DB.prepare(
    'SELECT DISTINCT ts FROM x_trend_snapshots WHERE woeid=? ORDER BY ts DESC LIMIT 2'
  ).bind(woeid).all<{ ts: number }>();
  const latestTs = Number(times.results?.[0]?.ts) || 0;
  const previousTs = Number(times.results?.[1]?.ts) || 0;
  if (!latestTs) return [] as Array<Record<string, string | number>>;
  const { results } = await env.DB.prepare(
    `SELECT l.trend_name,l.tweet_count,l.rank,l.ts,COALESCE(p.tweet_count,0) AS previous_count
     FROM x_trend_snapshots l
     LEFT JOIN x_trend_snapshots p ON p.woeid=l.woeid AND p.trend_name=l.trend_name AND p.ts=?
     WHERE l.woeid=? AND l.ts=? ORDER BY l.rank LIMIT ?`
  ).bind(previousTs, woeid, latestTs, limit).all<Record<string, string | number>>();
  return (results ?? []).map((r) => {
    const current = Number(r.tweet_count) || 0;
    const previous = Number(r.previous_count) || 0;
    return {
      ...r,
      delta_pct: previous > 0 ? ((current - previous) / previous) * 100 : 0,
    };
  });
}

export async function getRuleOverview(env: { DB: D1Database }) {
  await ensureSchema(env);
  const { results } = await env.DB.prepare(
    `SELECT r.id,r.type,r.label,r.query,r.enabled,r.created_at,s.ts,s.count_5m,s.previous_5m,s.count_15m,s.count_60m,s.ratio_5m
     FROM x_watch_rules r
     LEFT JOIN x_rule_snapshots s ON s.rule_id=r.id AND s.ts=(SELECT MAX(s2.ts) FROM x_rule_snapshots s2 WHERE s2.rule_id=r.id)
     ORDER BY r.enabled DESC, COALESCE(s.ratio_5m,0) DESC, r.id DESC`
  ).all<Record<string, string | number>>();
  return results ?? [];
}

export async function getTopPosts(env: { DB: D1Database }, limit = 30) {
  await ensureSchema(env);
  const since = Date.now() - 24 * 3600_000;
  const { results } = await env.DB.prepare(
    `SELECT p.*,GROUP_CONCAT(DISTINCT r.label) AS rule_labels
     FROM x_posts p
     LEFT JOIN x_rule_posts rp ON rp.post_id=p.post_id
     LEFT JOIN x_watch_rules r ON r.id=rp.rule_id
     WHERE p.fetched_at>=?
     GROUP BY p.post_id
     ORDER BY p.engagement DESC,p.fetched_at DESC LIMIT ?`
  ).bind(since, limit).all<Record<string, string | number>>();
  return results ?? [];
}

export async function getRecentAlerts(env: { DB: D1Database }, limit = 30) {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT * FROM x_alerts ORDER BY ts DESC LIMIT ?')
    .bind(limit).all<Record<string, string | number>>();
  return results ?? [];
}

export async function getRecentRuns(env: { DB: D1Database }, limit = 20) {
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT * FROM x_runs ORDER BY ts DESC LIMIT ?')
    .bind(limit).all<Record<string, string | number>>();
  return results ?? [];
}

export async function prune(env: { DB: D1Database }, now = Date.now()): Promise<void> {
  const cutoff = now - 14 * 86_400_000;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM x_trend_snapshots WHERE ts<?').bind(cutoff),
    env.DB.prepare('DELETE FROM x_rule_snapshots WHERE ts<?').bind(cutoff),
    env.DB.prepare('DELETE FROM x_alerts WHERE ts<?').bind(cutoff),
    env.DB.prepare('DELETE FROM x_runs WHERE ts<?').bind(cutoff),
    env.DB.prepare('DELETE FROM x_rule_posts WHERE fetched_at<?').bind(cutoff),
    env.DB.prepare('DELETE FROM x_posts WHERE fetched_at<?').bind(cutoff),
  ]);
}
