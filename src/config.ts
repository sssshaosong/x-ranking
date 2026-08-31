/**
 * 每个源的判定参数。不同源的数值量级和噪声差异极大，必须分开调。
 *  minScore   绝对热度下限，过滤刚冒头的小数字噪声
 *  minRate    最小增速（score / 小时），防止低基数放大出假信号
 *  ratio      近 1 小时增速 ÷ 24 小时自身基线，达到该倍数判为异动
 *  newEntry   首次出现且排名进入该位次，直接告警（适用于只有排名的源）
 *  cooldown   同一条目多少小时内只告警一次
 */
export interface SourceConfig {
  label: string;
  enabled: boolean;
  minScore: number;
  minRate: number;
  ratio: number;
  newEntry: number;
  cooldownHours: number;
}

export const SOURCES: Record<string, SourceConfig> = {
  hn: {
    label: 'Hacker News',
    enabled: true,
    minScore: 30,
    minRate: 20,
    ratio: 2.5,
    newEntry: 0,
    cooldownHours: 6,
  },
  github: {
    label: 'GitHub Trending',
    enabled: true,
    minScore: 50,
    minRate: 10,
    ratio: 2.5,
    newEntry: 5,
    cooldownHours: 12,
  },
  coingecko: {
    label: 'CoinGecko 趋势',
    enabled: true,
    minScore: 0,
    minRate: 0.5,
    ratio: 3,
    newEntry: 3,
    cooldownHours: 6,
  },
  bilibili: {
    label: 'B站热门',
    enabled: true,
    minScore: 100_000,
    minRate: 20_000,
    ratio: 2,
    newEntry: 3,
    cooldownHours: 8,
  },
  baidu: {
    label: '百度热搜',
    enabled: true,
    minScore: 1_000_000,
    minRate: 150_000,
    ratio: 2,
    newEntry: 5,
    cooldownHours: 8,
  },
  gtrends: {
    label: 'Google Trends',
    enabled: true,
    // 搜索量是分桶粗值（如 5000+），速度判定噪声大，主要靠新上榜信号
    minScore: 0,
    minRate: 0,
    ratio: 0,
    newEntry: 10,
    cooldownHours: 12,
  },
};

/** Google Trends 分区。geo=CN 会返回 400，中文区改用 TW + HK。 */
export const GTREND_GEOS: Array<{ geo: string; label: string }> = [
  { geo: 'US', label: '英文区' },
  { geo: 'JP', label: '日语区' },
  { geo: 'KR', label: '韩语区' },
  { geo: 'TW', label: '中文区(台)' },
  { geo: 'HK', label: '中文区(港)' },
];

/** 快照保留天数。只留够算基线的长度，旧数据一律清掉。 */
export const KEEP_DAYS = 7;

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export function cfg(source: string): SourceConfig {
  const base = source.split(':')[0];
  return SOURCES[base] ?? SOURCES.hn;
}

async function once(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 带一次重试。第三方站点偶发超时很常见，重试一次能救回大部分。 */
export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  try {
    return await once(url, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('HTTP 4')) throw e; // 4xx 是请求本身有问题，重试没意义
    return await once(url, timeoutMs);
  }
}

/** 解析 "$21,469,262" / "1,234" / "1.2K" / "3.4万" / "5,000+" 这类杂糅格式 */
export function parseCount(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  const s = String(raw).replace(/[+$¥,\s]/g, '').trim();
  const m = s.match(/-?\d+(?:\.\d+)?\s*([万万亿千KkMmBb])?/);
  if (!m) return 0;
  let n = parseFloat(m[0].replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  const u = m[1];
  const unit: Record<string, number> = { 万: 1e4, 亿: 1e8, 千: 1e3, k: 1e3, m: 1e6, b: 1e9 };
  if (u && unit[u.toLowerCase()]) n *= unit[u.toLowerCase()];
  return Math.round(n);
}
