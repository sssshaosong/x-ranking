import { renderAdminPage } from './admin';
import { clearSessionCookie, createSessionCookie, isAuthorized } from './auth';
import { SOURCES, cfg } from './config';
import { dedupe, detect } from './detect';
import { sendTelegram, sendTest } from './notify';
import { claimScheduledRun, getScheduleSettings, updateScheduleSettings } from './settings';
import { renderStatusPage } from './status';
import * as store from './store';
import { fetchBaidu } from './sources/baidu';
import { fetchBilibili } from './sources/bilibili';
import { fetchCoinGecko } from './sources/coingecko';
import { fetchGitHub } from './sources/github';
import { fetchGTrends } from './sources/gtrends';
import { fetchHN } from './sources/hn';
import type { Env, SourceResult } from './types';

const MAX_NOTIFY_PER_RUN = 10;
const NOTIFY_GAP_MS = 200;

type SourceJob = { name: string; promise: Promise<SourceResult | SourceResult[]> };

async function collect(now: number): Promise<{ results: SourceResult[]; errors: string[] }> {
  const jobs: SourceJob[] = [];
  if (SOURCES.hn.enabled) jobs.push({ name: 'hn', promise: fetchHN(now) });
  if (SOURCES.github.enabled) jobs.push({ name: 'github', promise: fetchGitHub() });
  if (SOURCES.coingecko.enabled) jobs.push({ name: 'coingecko', promise: fetchCoinGecko() });
  if (SOURCES.bilibili.enabled) jobs.push({ name: 'bilibili', promise: fetchBilibili() });
  if (SOURCES.baidu.enabled) jobs.push({ name: 'baidu', promise: fetchBaidu() });
  if (SOURCES.gtrends.enabled) jobs.push({ name: 'gtrends', promise: fetchGTrends() });

  const settled = await Promise.allSettled(jobs.map((j) => j.promise));
  const results: SourceResult[] = [];
  const errors: string[] = [];
  settled.forEach((s, i) => {
    const job = jobs[i];
    if (s.status === 'fulfilled') {
      if (Array.isArray(s.value)) results.push(...s.value);
      else results.push(s.value);
    } else {
      errors.push(`${job.name}: ${String(s.reason?.message ?? s.reason).slice(0, 180)}`);
    }
  });
  for (const r of results) if (r.error) errors.push(`${r.source}: ${r.error}`);
  return { results, errors };
}

function sourceStats(results: SourceResult[]) {
  return results.map((r) => ({ source: r.source, count: r.items.length, error: r.error ?? null }));
}

export async function run(env: Env, now = Date.now()) {
  const { results, errors } = await collect(now);
  const stats = sourceStats(results);
  const sources = results.map((r) => r.source);
  const lastAlertAt = await store.loadLastAlerts(env, sources, now);

  let polled = 0;
  let inserted = 0;
  let notified = 0;
  const keptAll: Awaited<ReturnType<typeof detect>> = [];

  for (const r of results) {
    if (!r.items.length || !cfg(r.source).enabled) continue;
    const [history, meta, bootstrapped] = await Promise.all([
      store.loadHistory(env, r.source, now),
      store.loadMeta(env, r.source),
      store.isBootstrapped(env, r.source),
    ]);
    const detections = detect(r.source, r.items, history, meta, now, bootstrapped);
    const { kept } = dedupe(detections, lastAlertAt, now);
    await store.upsertItems(env, r.source, r.items, now);
    await store.insertSnapshots(env, r.source, r.items, now);
    if (kept.length) await store.recordAlerts(env, kept, now);
    polled += r.items.length;
    inserted += r.items.length;
    keptAll.push(...kept);
  }

  for (const d of keptAll.slice(0, MAX_NOTIFY_PER_RUN)) {
    try {
      if (await sendTelegram(env, d)) {
        notified++;
        await new Promise((r) => setTimeout(r, NOTIFY_GAP_MS));
      }
    } catch (e) {
      errors.push(`tg: ${String(e instanceof Error ? e.message : e).slice(0, 180)}`);
    }
  }

  const pruned = await store.prune(env, now);
  await store.logRun(env, now, { polled, inserted, alerts: keptAll.length, notified }, errors);
  return { ok: true, polled, inserted, alerts: keptAll.length, notified, pruned, sources: stats, errors };
}

async function health(env: Env) {
  const now = Date.now();
  let db: Record<string, unknown>;
  try {
    const [items, snapshots, alerts, runs] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM items').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM snapshots').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM alerts').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM runs').first<{ n: number }>(),
    ]);
    db = { ok: true, items: items?.n ?? 0, snapshots: snapshots?.n ?? 0, alerts: alerts?.n ?? 0, runs: runs?.n ?? 0 };
  } catch (e) {
    db = { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 300) };
  }
  const [collected, schedule] = await Promise.all([collect(now), getScheduleSettings(env, now)]);
  return {
    ok: db.ok === true,
    time: new Date(now).toISOString(),
    db,
    schedule,
    secrets: {
      runToken: !!env.RUN_TOKEN,
      telegramBotToken: !!env.TELEGRAM_BOT_TOKEN,
      telegramChatId: !!env.TELEGRAM_CHAT_ID,
    },
    sources: sourceStats(collected.results),
    fetchErrors: collected.errors,
  };
}

async function statusPage(env: Env): Promise<Response> {
  const [runs, alerts, schedule] = await Promise.all([
    store.recentRuns(env, 72),
    store.recentAlerts(env, 30),
    getScheduleSettings(env),
  ]);
  let html = renderStatusPage({
    runs,
    alerts,
    tgConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    now: Date.now(),
  });
  const scheduleText = schedule.enabled ? `每 ${schedule.intervalMinutes} 分钟` : '定时已暂停';
  html = html.replaceAll('每 20 分钟', scheduleText);
  html = html.replace(
    '</body>',
    '<a href="/admin" style="position:fixed;right:18px;bottom:18px;background:#111827;color:#fff;padding:10px 14px;border-radius:999px;text-decoration:none;box-shadow:0 3px 14px #0003">⚙ 控制台</a></body>'
  );
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function errorJson(e: unknown) {
  const message = String(e instanceof Error ? e.message : e).slice(0, 500);
  console.error(message);
  return Response.json({ ok: false, error: message }, { status: 500 });
}

function unauthorized() {
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        const claim = await claimScheduledRun(env);
        if (claim.run) await run(env);
      })().catch((e) => console.error('scheduled run failed', e))
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/admin') {
      return new Response(renderAdminPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/api/login' && req.method === 'POST') {
      try {
        const body = (await req.json()) as { token?: string };
        if (!env.RUN_TOKEN || body.token !== env.RUN_TOKEN) return unauthorized();
        return Response.json(
          { ok: true },
          { headers: { 'Set-Cookie': await createSessionCookie(env) } }
        );
      } catch (e) {
        return errorJson(e);
      }
    }

    if (url.pathname === '/api/logout' && req.method === 'POST') {
      return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
    }

    if (url.pathname.startsWith('/api/')) {
      if (!(await isAuthorized(req, env))) return unauthorized();
      try {
        if (url.pathname === '/api/run' && req.method === 'POST') return Response.json(await run(env));
        if (url.pathname === '/api/test' && req.method === 'POST') return Response.json(await sendTest(env));
        if (url.pathname === '/api/health' && req.method === 'GET') return Response.json(await health(env));
        if (url.pathname === '/api/settings' && req.method === 'GET') return Response.json(await getScheduleSettings(env));
        if (url.pathname === '/api/settings' && req.method === 'POST') {
          const body = (await req.json()) as { enabled?: boolean; intervalMinutes?: number };
          return Response.json(await updateScheduleSettings(env, body.enabled !== false, body.intervalMinutes));
        }
        return new Response('not found', { status: 404 });
      } catch (e) {
        return errorJson(e);
      }
    }

    // Legacy endpoints remain available for scripts/bookmarks. The admin page does not expose tokens in URLs.
    if (url.pathname === '/run') {
      if (!(await isAuthorized(req, env))) return new Response('forbidden', { status: 403 });
      try { return Response.json(await run(env)); } catch (e) { return errorJson(e); }
    }
    if (url.pathname === '/health') {
      if (!(await isAuthorized(req, env))) return new Response('forbidden', { status: 403 });
      try { return Response.json(await health(env)); } catch (e) { return errorJson(e); }
    }
    if (url.pathname === '/test') {
      if (!(await isAuthorized(req, env))) return new Response('forbidden', { status: 403 });
      try { return Response.json(await sendTest(env)); } catch (e) { return errorJson(e); }
    }

    if (url.pathname === '/') return statusPage(env);
    return new Response('not found', { status: 404 });
  },
};
