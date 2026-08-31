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

async function collect(now: number): Promise<{ results: SourceResult[]; errors: string[] }> {
  const jobs: Array<Promise<SourceResult | SourceResult[]>> = [];
  if (SOURCES.hn.enabled) jobs.push(fetchHN(now));
  if (SOURCES.github.enabled) jobs.push(fetchGitHub());
  if (SOURCES.coingecko.enabled) jobs.push(fetchCoinGecko());
  if (SOURCES.bilibili.enabled) jobs.push(fetchBilibili());
  if (SOURCES.baidu.enabled) jobs.push(fetchBaidu());
  if (SOURCES.gtrends.enabled) jobs.push(fetchGTrends());

  const settled = await Promise.allSettled(jobs);
  const results: SourceResult[] = [];
  const errors: string[] = [];

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (Array.isArray(s.value)) results.push(...s.value);
      else results.push(s.value);
    } else {
      errors.push(String(s.reason?.message ?? s.reason).slice(0, 120));
    }
  }
  for (const r of results) {
    if (r.error) errors.push(`${r.source}: ${r.error}`);
  }
  return { results, errors };
}

export async function run(env: Env, now = Date.now()) {
  const { results, errors } = await collect(now);
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
      errors.push(`tg: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
    }
  }

  const pruned = await store.prune(env, now);
  await store.logRun(env, now, { polled, inserted, alerts: keptAll.length, notified }, errors);

  return { polled, inserted, alerts: keptAll.length, notified, pruned, errors };
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

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env).catch((e) => console.error('run failed', e)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/run') {
      if (!env.RUN_TOKEN || url.searchParams.get('token') !== env.RUN_TOKEN) {
        return new Response('forbidden', { status: 403 });
      }
      const r = await run(env);
      return Response.json(r);
    }

    // 配置自查：确认 bot token 和 chat_id 是否配对成功
    if (url.pathname === '/test') {
      if (!env.RUN_TOKEN || url.searchParams.get('token') !== env.RUN_TOKEN) {
        return new Response('forbidden', { status: 403 });
      }
      return Response.json(await sendTest(env));
    }

    if (url.pathname === '/') return statusPage(env);

    return new Response('not found', { status: 404 });
  },
};
