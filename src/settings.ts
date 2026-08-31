import type { Env } from './types';

export interface ScheduleSettings {
  enabled: boolean;
  intervalMinutes: number;
  lastScheduledAt: number;
  nextRunAt: number | null;
}

const DEFAULT_INTERVAL_MINUTES = 20;
const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 24 * 60;

async function ensureTable(env: Env): Promise<void> {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS app_settings (' +
      'id INTEGER PRIMARY KEY CHECK (id = 1), ' +
      'enabled INTEGER NOT NULL DEFAULT 1, ' +
      'interval_minutes INTEGER NOT NULL DEFAULT 20, ' +
      'last_scheduled_at INTEGER NOT NULL DEFAULT 0)'
  ).run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO app_settings (id, enabled, interval_minutes, last_scheduled_at) VALUES (1, 1, ?, 0)'
  )
    .bind(DEFAULT_INTERVAL_MINUTES)
    .run();
}

function normalizeInterval(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, n));
}

export async function getScheduleSettings(env: Env, now = Date.now()): Promise<ScheduleSettings> {
  await ensureTable(env);
  const row = await env.DB.prepare(
    'SELECT enabled, interval_minutes, last_scheduled_at FROM app_settings WHERE id = 1'
  ).first<{ enabled: number; interval_minutes: number; last_scheduled_at: number }>();

  const enabled = !!row?.enabled;
  const intervalMinutes = normalizeInterval(row?.interval_minutes);
  const lastScheduledAt = Number(row?.last_scheduled_at) || 0;
  return {
    enabled,
    intervalMinutes,
    lastScheduledAt,
    nextRunAt: enabled ? (lastScheduledAt ? lastScheduledAt + intervalMinutes * 60_000 : now) : null,
  };
}

export async function updateScheduleSettings(
  env: Env,
  enabled: boolean,
  intervalMinutes: unknown
): Promise<ScheduleSettings> {
  await ensureTable(env);
  const interval = normalizeInterval(intervalMinutes);
  await env.DB.prepare('UPDATE app_settings SET enabled = ?, interval_minutes = ? WHERE id = 1')
    .bind(enabled ? 1 : 0, interval)
    .run();
  return getScheduleSettings(env);
}

export async function claimScheduledRun(
  env: Env,
  now = Date.now()
): Promise<{ run: boolean; settings: ScheduleSettings }> {
  const settings = await getScheduleSettings(env, now);
  if (!settings.enabled) return { run: false, settings };

  if (
    settings.lastScheduledAt > 0 &&
    now - settings.lastScheduledAt < settings.intervalMinutes * 60_000
  ) {
    return { run: false, settings };
  }

  await env.DB.prepare('UPDATE app_settings SET last_scheduled_at = ? WHERE id = 1')
    .bind(now)
    .run();

  return {
    run: true,
    settings: {
      ...settings,
      lastScheduledAt: now,
      nextRunAt: now + settings.intervalMinutes * 60_000,
    },
  };
}
