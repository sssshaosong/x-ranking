import { renderAdminPage } from './admin';
import { clearSessionCookie, createSessionCookie, isAuthorized } from './auth';
import { runXCollection } from './collector';
import { sendTest } from './notify';
import { renderOverview, renderPostsPage, renderTrendsPage, renderWatchPage } from './pages';
import type { Env, WatchRuleType, XSettings } from './types';
import { fetchTrends } from './xapi';
import {
  addRule,
  claimScheduledRun,
  deleteRule,
  ensureSchema,
  getLatestTrends,
  getRecentAlerts,
  getRecentRuns,
  getRuleOverview,
  getSettings,
  getTopPosts,
  listRules,
  setRuleEnabled,
  updateSettings,
} from './xstore';

function html(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function errorJson(error: unknown, status = 500): Response {
  const message = String(error instanceof Error ? error.message : error).slice(0, 900);
  console.error(message);
  return Response.json({ ok: false, error: message }, { status });
}

function unauthorized(): Response {
  return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
}

async function overviewPage(env: Env): Promise<Response> {
  await ensureSchema(env);
  const settings = await getSettings(env);
  const [trends, rules, posts, alerts, runs] = await Promise.all([
    getLatestTrends(env, settings.woeid, 20),
    getRuleOverview(env),
    getTopPosts(env, 12),
    getRecentAlerts(env, 15),
    getRecentRuns(env, 12),
  ]);
  return html(renderOverview({
    settings,
    trends,
    rules,
    posts,
    alerts,
    runs,
    xConfigured: !!env.X_BEARER_TOKEN,
    tgConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
  }));
}

async function trendsPage(env: Env): Promise<Response> {
  const settings = await getSettings(env);
  return html(renderTrendsPage(await getLatestTrends(env, settings.woeid, 50), settings));
}

async function watchPage(req: Request, env: Env): Promise<Response> {
  const [settings, rules, authed] = await Promise.all([
    getSettings(env),
    getRuleOverview(env),
    isAuthorized(req, env),
  ]);
  return html(renderWatchPage(rules, authed, settings));
}

async function postsPage(env: Env): Promise<Response> {
  return html(renderPostsPage(await getTopPosts(env, 50)));
}

async function health(env: Env) {
  await ensureSchema(env);
  const settings = await getSettings(env);
  let db: Record<string, unknown>;
  try {
    const [runs, rules, trends] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM x_runs').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM x_watch_rules').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM x_trend_snapshots').first<{ n: number }>(),
    ]);
    db = { ok: true, runs: runs?.n ?? 0, rules: rules?.n ?? 0, trendSnapshots: trends?.n ?? 0 };
  } catch (e) {
    db = { ok: false, error: String(e instanceof Error ? e.message : e) };
  }

  let x: Record<string, unknown>;
  if (!env.X_BEARER_TOKEN) {
    x = { ok: false, trends: 0, error: 'X_BEARER_TOKEN is not configured' };
  } else {
    try {
      const sample = await fetchTrends(env, settings.woeid, 1);
      x = { ok: true, trends: sample.length, sample: sample[0]?.name ?? null };
    } catch (e) {
      x = { ok: false, trends: 0, error: String(e instanceof Error ? e.message : e).slice(0, 700) };
    }
  }
  const rules = await listRules(env);
  return {
    ok: db.ok === true && x.ok === true,
    db,
    x,
    rules: rules.length,
    settings,
    secrets: {
      xBearerToken: !!env.X_BEARER_TOKEN,
      runToken: !!env.RUN_TOKEN,
      telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    },
  };
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      if (await claimScheduledRun(env)) await runXCollection(env);
    })().catch((e) => console.error('scheduled X collection failed', e)));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === 'GET' && url.pathname === '/') return overviewPage(env);
      if (req.method === 'GET' && url.pathname === '/trends') return trendsPage(env);
      if (req.method === 'GET' && url.pathname === '/watch') return watchPage(req, env);
      if (req.method === 'GET' && url.pathname === '/posts') return postsPage(env);
      if (req.method === 'GET' && url.pathname === '/admin') return html(renderAdminPage());

      if (url.pathname === '/api/login' && req.method === 'POST') {
        const body = (await req.json()) as { token?: string };
        if (!env.RUN_TOKEN || body.token !== env.RUN_TOKEN) return unauthorized();
        return Response.json({ ok: true }, { headers: { 'Set-Cookie': await createSessionCookie(env) } });
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
      }

      if (url.pathname.startsWith('/api/')) {
        if (!(await isAuthorized(req, env))) return unauthorized();

        if (url.pathname === '/api/run' && req.method === 'POST') {
          return Response.json(await runXCollection(env));
        }
        if (url.pathname === '/api/health' && req.method === 'GET') {
          return Response.json(await health(env));
        }
        if (url.pathname === '/api/test' && req.method === 'POST') {
          return Response.json(await sendTest(env));
        }
        if (url.pathname === '/api/settings' && req.method === 'GET') {
          return Response.json(await getSettings(env));
        }
        if (url.pathname === '/api/settings' && req.method === 'POST') {
          const body = (await req.json()) as Partial<XSettings>;
          return Response.json(await updateSettings(env, body));
        }
        if (url.pathname === '/api/rules' && req.method === 'GET') {
          return Response.json({ ok: true, rules: await listRules(env) });
        }
        if (url.pathname === '/api/rules' && req.method === 'POST') {
          const body = (await req.json()) as { type?: WatchRuleType; label?: string; query?: string };
          if (body.type !== 'keyword' && body.type !== 'account') return errorJson('type must be keyword or account', 400);
          return Response.json({ ok: true, rule: await addRule(env, body.type, body.label ?? '', body.query ?? '') });
        }

        const match = url.pathname.match(/^\/api\/rules\/(\d+)$/);
        if (match) {
          const id = Number(match[1]);
          if (req.method === 'PATCH') {
            const body = (await req.json()) as { enabled?: boolean };
            await setRuleEnabled(env, id, body.enabled !== false);
            return Response.json({ ok: true });
          }
          if (req.method === 'DELETE') {
            await deleteRule(env, id);
            return Response.json({ ok: true });
          }
        }
        return new Response('not found', { status: 404 });
      }

      return new Response('not found', { status: 404 });
    } catch (e) {
      return errorJson(e);
    }
  },
};
