import { SOURCES, cfg } from './config';
import { dedupe, detect } from './detect';
import { sendTelegram, sendTest } from './notify';
import { renderStatusPage } from './status';
import * as store from './store';
import { fetchBaidu } from './sources/baidu';
import { fetchBilibili } from './sources/bilibili';
import { fetchCoinGecko } from './sources/coingecko';
import { fetchGitHub } from './sources/github';
import { fetchGTrends } from './sources/gtrends';
import { fetchHN } from './sources/hn';
import type { Env, SourceResult } from './types';

/** 单次最多推几条。异常时兜底，避免刷屏。 */
const MAX_NOTIFY_PER_RUN = 10;
/** 两条推送之间的间隔，Telegram 对同一直播间约 20 条/分钟，留足余量。 */
const NOTIFY_GAP_MS = 200;

type SourceJob = {
  name: string;
  promise: Promise<SourceResult | SourceResult[]>;
};

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

  for (const r of results) {
    if (r.error) errors.push(`${r.source}: ${r.error}`);
  }
  return { results, errors };
}

function sourceStats(results: SourceResult[]) {
  return results.map((r) => ({
    source: r.source,
    count: r.items.length,
    error: r.error ?? null,
  }));
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

  return {
    ok: true,
    polled,
    inserted,
    alerts: keptAll.length,
    notified,
    pruned,
    sources: stats,
    errors,
  };
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
    db = {
      ok: true,
      items: items?.n ?? 0,
      snapshots: snapshots?.n ?? 0,
      alerts: alerts?.n ?? 0,
      runs: runs?.n ?? 0,
    };
  } catch (e) {
    db = {
      ok: false,
      error: String(e instanceof Error ? e.message : e).slice(0, 300),
    };
  }

  const { results, errors } = await collect(now);

  return {
    ok: db.ok === true,
    time: new Date(now).toISOString(),
    db,
    secrets: {
      runToken: !!env.RUN_TOKEN,
      telegramBotToken: !!env.TELEGRAM_BOT_TOKEN,
      telegramChatId: !!env.TELEGRAM_CHAT_ID,
    },
    sources: sourceStats(results),
    fetchErrors: errors,
  };
}

async function statusPage(env: Env): Promise<Response> {
  // 运行记录取 72 条（够覆盖 24 小时，用于统计），表格只展示最近 10 条
  const [runs, alerts] = await Promise.all([store.recentRuns(env, 72), store.recentAlerts(env, 30)]);

  const html = renderStatusPage({
    runs,
    alerts,
    tgConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    now: Date.now(),
  });

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function authorized(url: URL, env: Env) {
  return !!env.RUN_TOKEN && url.searchParams.get('token') === env.RUN_TOKEN;
}

function errorJson(e: unknown) {
  const message = String(e instanceof Error ? e.message : e).slice(0, 500);
  console.error(message);
  return Response.json({ ok: false, error: message }, { status: 500 });
}

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env).catch((e) => console.error('run failed', e)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/run') {
      if (!authorized(url, env)) return new Response('forbidden', { status: 403 });
      try {
        return Response.json(await run(env));
      } catch (e) {
        return errorJson(e);
      }
    }

    if (url.pathname === '/health') {
      if (!authorized(url, env)) return new Response('forbidden', { status: 403 });
      try {
        return Response.json(await health(env));
      } catch (e) {
        return errorJson(e);
      }
    }

    // 配置自查：确认 bot token 和 chat_id 是否配对成功
    if (url.pathname === '/test') {
      if (!authorized(url, env)) return new Response('forbidden', { status: 403 });
      try {
        return Response.json(await sendTest(env));
      } catch (e) {
        return errorJson(e);
      }
    }

    if (url.pathname === '/') return statusPage(env);

    return new Response('not found', { status: 404 });
  },
};
