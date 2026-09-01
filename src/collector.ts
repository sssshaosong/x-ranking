import { sendAlert } from './notify';
import type { AlertEvent, Env, RunSummary } from './types';
import { fetchRecentCounts, fetchTrends, ruleToQuery, searchRecentPosts, xSearchUrl } from './xapi';
import {
  ensureSchema,
  getSettings,
  listRules,
  loadPreviousTrendCounts,
  logRun,
  markAlertNotified,
  prune,
  recordAlert,
  savePosts,
  saveRuleSnapshot,
  saveTrends,
} from './xstore';

const MAX_RULES_PER_RUN = 20;
const MAX_ALERTS_PER_RUN = 6;
const ALERT_COOLDOWN_MS = 60 * 60_000;

async function recentlyAlerted(env: Env, kind: AlertEvent['kind'], subjectKey: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM x_alerts WHERE kind=? AND subject_key=? AND ts>=? LIMIT 1'
  ).bind(kind, subjectKey, now - ALERT_COOLDOWN_MS).first<{ ok: number }>();
  return !!row;
}

function trendAlert(name: string, current: number, previous: number, now: number): AlertEvent {
  const ratio = previous > 0 ? current / previous : 0;
  return {
    ts: now,
    kind: 'trend-jump',
    label: '官方 Trends',
    subjectKey: name,
    value: current,
    ratio,
    detail: `X 官方趋势量级从 ${previous.toLocaleString()} 升到 ${current.toLocaleString()}`,
    url: xSearchUrl(name),
  };
}

export async function runXCollection(env: Env, now = Date.now()): Promise<RunSummary> {
  await ensureSchema(env);
  const settings = await getSettings(env, now);
  const errors: string[] = [];
  const pendingAlerts: Array<{ alert: AlertEvent; id: number }> = [];

  let trendCount = 0;
  let ruleCount = 0;
  let postCount = 0;
  let notified = 0;

  try {
    const previous = await loadPreviousTrendCounts(env, settings.woeid);
    const trends = await fetchTrends(env, settings.woeid, settings.maxTrends);
    trendCount = trends.length;
    await saveTrends(env, trends, now);

    for (const trend of trends) {
      const prev = previous.get(trend.name) ?? 0;
      if (!prev || trend.tweetCount < settings.spikeMinPosts) continue;
      const ratio = trend.tweetCount / prev;
      if (ratio < settings.spikeRatio) continue;
      if (await recentlyAlerted(env, 'trend-jump', trend.name, now)) continue;
      const alert = trendAlert(trend.name, trend.tweetCount, prev, now);
      const id = await recordAlert(env, alert);
      pendingAlerts.push({ alert, id });
    }
  } catch (e) {
    errors.push(`trends: ${String(e instanceof Error ? e.message : e).slice(0, 500)}`);
  }

  const rules = (await listRules(env)).filter((r) => r.enabled);
  if (rules.length > MAX_RULES_PER_RUN) {
    errors.push(`rules: ${rules.length} enabled, only first ${MAX_RULES_PER_RUN} processed to control X API usage`);
  }

  for (const rule of rules.slice(0, MAX_RULES_PER_RUN)) {
    const query = ruleToQuery(rule.type, rule.query);
    try {
      const counts = await fetchRecentCounts(env, query, now);
      ruleCount++;
      await saveRuleSnapshot(env, rule.id, now, counts);

      if (
        counts.count5m >= settings.spikeMinPosts &&
        counts.previous5m > 0 &&
        counts.ratio5m >= settings.spikeRatio &&
        !(await recentlyAlerted(env, 'rule-spike', `rule:${rule.id}`, now))
      ) {
        const alert: AlertEvent = {
          ts: now,
          kind: 'rule-spike',
          label: rule.label,
          subjectKey: `rule:${rule.id}`,
          value: counts.count5m,
          ratio: counts.ratio5m,
          detail: `最近 5 分钟 ${counts.count5m} 条，前 5 分钟 ${counts.previous5m} 条；近 1 小时 ${counts.count60m} 条`,
          url: xSearchUrl(query),
        };
        const id = await recordAlert(env, alert);
        pendingAlerts.push({ alert, id });
      }

      if (counts.count60m > 0) {
        try {
          const posts = await searchRecentPosts(env, query, settings.postsPerRule);
          postCount += posts.length;
          await savePosts(env, rule.id, posts, now);
        } catch (e) {
          errors.push(`${rule.label} posts: ${String(e instanceof Error ? e.message : e).slice(0, 350)}`);
        }
      }
    } catch (e) {
      errors.push(`${rule.label}: ${String(e instanceof Error ? e.message : e).slice(0, 350)}`);
    }
  }

  for (const item of pendingAlerts.slice(0, MAX_ALERTS_PER_RUN)) {
    try {
      if (await sendAlert(env, item.alert)) {
        notified++;
        await markAlertNotified(env, item.id);
      }
    } catch (e) {
      errors.push(`telegram: ${String(e instanceof Error ? e.message : e).slice(0, 350)}`);
    }
  }

  await prune(env, now);
  const summary: RunSummary = {
    ok: errors.length === 0,
    ts: now,
    trends: trendCount,
    rules: ruleCount,
    posts: postCount,
    alerts: pendingAlerts.length,
    notified,
    errors,
  };
  await logRun(env, summary);
  return summary;
}
