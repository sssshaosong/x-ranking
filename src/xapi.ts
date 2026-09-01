import type { Env, XPost, XTrend } from './types';

const API = 'https://api.x.com';

function bearer(env: Env): string {
  if (!env.X_BEARER_TOKEN) throw new Error('X_BEARER_TOKEN is not configured');
  return env.X_BEARER_TOKEN;
}

async function xGet<T>(env: Env, path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${bearer(env)}`,
      Accept: 'application/json',
      'User-Agent': 'x-ranking/1.0',
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  if (!res.ok) {
    const detail = body && typeof body === 'object'
      ? JSON.stringify(body).slice(0, 700)
      : String(body).slice(0, 700);
    throw new Error(`X API ${res.status}: ${detail}`);
  }
  return body as T;
}

export async function fetchTrends(env: Env, woeid: number, maxTrends: number): Promise<XTrend[]> {
  const body = await xGet<{
    data?: Array<{ trend_name?: string; tweet_count?: number | null }>;
    errors?: unknown[];
  }>(env, `/2/trends/by/woeid/${woeid}`, {
    max_trends: Math.min(50, Math.max(1, maxTrends)),
    'trend.fields': 'trend_name,tweet_count',
  });

  return (body.data ?? [])
    .filter((item) => item.trend_name)
    .map((item, index) => ({
      name: String(item.trend_name),
      tweetCount: Number(item.tweet_count) || 0,
      rank: index + 1,
      woeid,
    }));
}

export interface CountWindow {
  count5m: number;
  previous5m: number;
  count15m: number;
  count60m: number;
  ratio5m: number;
  buckets: Array<{ start: string; end: string; postCount: number }>;
}

export async function fetchRecentCounts(env: Env, query: string, now = Date.now()): Promise<CountWindow> {
  const start = new Date(now - 65 * 60_000).toISOString();
  const body = await xGet<{
    data?: Array<{ start?: string; end?: string; post_count?: number }>;
  }>(env, '/2/tweets/counts/recent', {
    query,
    granularity: 'minute',
    start_time: start,
  });

  const buckets = (body.data ?? []).map((b) => ({
    start: String(b.start ?? ''),
    end: String(b.end ?? ''),
    postCount: Number(b.post_count) || 0,
  }));
  const counts = buckets.map((b) => b.postCount);
  const sumLast = (n: number, offset = 0) => {
    const end = Math.max(0, counts.length - offset);
    const begin = Math.max(0, end - n);
    return counts.slice(begin, end).reduce((a, b) => a + b, 0);
  };
  const count5m = sumLast(5);
  const previous5m = sumLast(5, 5);
  const count15m = sumLast(15);
  const count60m = sumLast(60);
  const ratio5m = previous5m > 0 ? count5m / previous5m : count5m > 0 ? 99 : 0;

  return { count5m, previous5m, count15m, count60m, ratio5m, buckets };
}

function engagement(metrics: Record<string, unknown> | undefined): number {
  if (!metrics) return 0;
  const like = Number(metrics.like_count) || 0;
  const repost = Number(metrics.repost_count) || 0;
  const reply = Number(metrics.reply_count) || 0;
  const quote = Number(metrics.quote_count) || 0;
  const bookmark = Number(metrics.bookmark_count) || 0;
  return like + repost * 2 + reply * 1.5 + quote * 2 + bookmark * 0.5;
}

export async function searchRecentPosts(env: Env, query: string, maxResults = 10): Promise<XPost[]> {
  const body = await xGet<{
    data?: Array<{
      id?: string;
      text?: string;
      created_at?: string;
      author_id?: string;
      public_metrics?: Record<string, unknown>;
    }>;
    includes?: {
      users?: Array<{
        id?: string;
        name?: string;
        username?: string;
        profile_image_url?: string;
        verified?: boolean;
      }>;
    };
  }>(env, '/2/tweets/search/recent', {
    query,
    max_results: Math.min(100, Math.max(10, maxResults)),
    sort_order: 'relevancy',
    'post.fields': 'created_at,public_metrics,author_id,lang',
    expansions: 'author_id',
    'user.fields': 'name,username,profile_image_url,verified,public_metrics',
  });

  const users = new Map((body.includes?.users ?? []).map((u) => [String(u.id ?? ''), u]));
  return (body.data ?? [])
    .filter((post) => post.id)
    .map((post) => {
      const author = users.get(String(post.author_id ?? ''));
      const metrics = post.public_metrics ?? {};
      const username = String(author?.username ?? 'unknown');
      return {
        id: String(post.id),
        text: String(post.text ?? ''),
        createdAt: String(post.created_at ?? ''),
        authorId: String(post.author_id ?? ''),
        authorName: String(author?.name ?? username),
        username,
        profileImageUrl: author?.profile_image_url,
        verified: !!author?.verified,
        metrics: {
          likeCount: Number(metrics.like_count) || 0,
          repostCount: Number(metrics.repost_count) || 0,
          replyCount: Number(metrics.reply_count) || 0,
          quoteCount: Number(metrics.quote_count) || 0,
          bookmarkCount: Number(metrics.bookmark_count) || 0,
          impressionCount: Number(metrics.impression_count) || 0,
        },
        engagement: engagement(metrics),
        url: `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(String(post.id))}`,
      } satisfies XPost;
    })
    .sort((a, b) => b.engagement - a.engagement);
}

export function ruleToQuery(type: 'keyword' | 'account', query: string): string {
  const clean = query.trim();
  if (type === 'account') {
    const username = clean.replace(/^@+/, '');
    return `from:${username}`;
  }
  return clean;
}

export function xSearchUrl(query: string): string {
  const url = new URL('https://x.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('src', 'typed_query');
  url.searchParams.set('f', 'live');
  return url.toString();
}
