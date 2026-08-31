import { KEEP_DAYS } from './config';
import type { ItemMeta } from './detect';
import type { Detection, Env, RawItem, SeriesPoint } from './types';

/** 取该源 24 小时内的历史序列，用于算基线和近期速度。 */
export async function loadHistory(
  env: Env,
  source: string,
  now: number
): Promise<Map<string, SeriesPoint[]>> {
  const since = now - KEEP_DAYS * 86_400_000;
  const { results } = await env.DB.prepare(
    'SELECT item_id, ts, score FROM snapshots WHERE source = ? AND ts >= ? ORDER BY item_id, ts'
  )
    .bind(source, since)
    .all<{ item_id: string; ts: number; score: number }>();

  const map = new Map<string, SeriesPoint[]>();
  for (const r of results ?? []) {
    const arr = map.get(r.item_id) ?? [];
    arr.push({ ts: r.ts, score: r.score });
    map.set(r.item_id, arr);
  }
  return map;
}

export async function loadMeta(env: Env, source: string): Promise<Map<string, ItemMeta>> {
  const { results } = await env.DB.prepare(
    'SELECT item_id, first_seen FROM items WHERE source = ?'
  )
    .bind(source)
    .all<{ item_id: string; first_seen: number }>();

  const map = new Map<string, ItemMeta>();
  for (const r of results ?? []) map.set(r.item_id, { firstSeen: r.first_seen });
  return map;
}

/** 该源是否已经跑过至少一轮——决定「新上榜」信号是否生效。 */
export async function isBootstrapped(env: Env, source: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM items WHERE source = ? LIMIT 1')
    .bind(source)
    .first<{ ok: number }>();
  return !!row;
}

export async function loadLastAlerts(
  env: Env,
  sources: string[],
  now: number
): Promise<Map<string, number>> {
  const since = now - 48 * 3600_000;
  const map = new Map<string, number>();
  for (const s of sources) {
    const { results } = await env.DB.prepare(
      'SELECT item_id, MAX(ts) AS ts FROM alerts WHERE source = ? AND ts >= ? GROUP BY item_id'
    )
      .bind(s, since)
      .all<{ item_id: string; ts: number }>();
    for (const r of results ?? []) map.set(`${s}|${r.item_id}`, r.ts);
  }
  return map;
}

export async function upsertItems(
  env: Env,
  source: string,
  items: RawItem[],
  now: number
): Promise<void> {
  if (!items.length) return;
  const stmts = items.map((it) =>
    env.DB.prepare(
      'INSERT INTO items (source, item_id, title, url, first_seen, last_seen) ' +
        'VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(source, item_id) DO UPDATE SET title = excluded.title, url = excluded.url, last_seen = excluded.last_seen'
    ).bind(source, it.id, it.title.slice(0, 200), it.url.slice(0, 500), now, now)
  );
  await env.DB.batch(stmts);
}

export async function insertSnapshots(
  env: Env,
  source: string,
  items: RawItem[],
  now: number
): Promise<void> {
  if (!items.length) return;
  const stmts = items.map((it) =>
    env.DB.prepare(
      'INSERT OR REPLACE INTO snapshots (source, item_id, ts, score, rank) VALUES (?, ?, ?, ?, ?)'
    ).bind(source, it.id, now, it.score, it.rank)
  );
  await env.DB.batch(stmts);
}

export async function recordAlerts(env: Env, detections: Detection[], now: number): Promise<void> {
  if (!detections.length) return;
  const stmts = detections.map((d) =>
    env.DB.prepare(
      'INSERT INTO alerts (source, item_id, ts, kind, ratio, rate, score) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(d.source, d.item.id, now, d.kind, d.ratio, d.rate, d.item.score)
  );
  await env.DB.batch(stmts);
}

/** 只保留够算基线的数据，其余一律删除。 */
export async function prune(env: Env, now: number): Promise<number> {
  const cutoff = now - KEEP_DAYS * 86_400_000;
  const snap = await env.DB.prepare('DELETE FROM snapshots WHERE ts < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM items WHERE last_seen < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM alerts WHERE ts < ?').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM runs WHERE ts < ?').bind(cutoff).run();
  const meta = snap.meta as { rows_written?: number } | undefined;
  return meta?.rows_written ?? 0;
}

export async function logRun(
  env: Env,
  now: number,
  stats: { polled: number; inserted: number; alerts: number; notified: number },
  errors: string[]
): Promise<void> {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO runs (ts, polled, inserted, alerts, notified, errors) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      now,
      stats.polled,
      stats.inserted,
      stats.alerts,
      stats.notified,
      errors.join(' | ').slice(0, 500)
    )
    .run();
}

export async function recentAlerts(env: Env, limit = 30) {
  const { results } = await env.DB.prepare(
    'SELECT a.source, a.item_id, a.ts, a.kind, a.ratio, a.rate, a.score, i.title, i.url ' +
      'FROM alerts a LEFT JOIN items i ON i.source = a.source AND i.item_id = a.item_id ' +
      'ORDER BY a.ts DESC LIMIT ?'
  )
    .bind(limit)
    .all<Record<string, string | number>>();
  return results ?? [];
}

export async function recentRuns(env: Env, limit = 10) {
  const { results } = await env.DB.prepare('SELECT * FROM runs ORDER BY ts DESC LIMIT ?')
    .bind(limit)
    .all<Record<string, string | number>>();
  return results ?? [];
}
