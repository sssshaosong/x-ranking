import { GTREND_GEOS, SOURCES } from './config';
import { fmt } from './notify';
import type { Env } from './types';

export interface SourceRow {
  source: string;
  item_id: string;
  ts: number;
  score: number;
  rank: number;
  title: string | null;
  url: string | null;
}

export async function loadSourceRows(env: Env): Promise<SourceRow[]> {
  const { results } = await env.DB.prepare(
    `WITH latest AS (
       SELECT source, MAX(ts) AS ts
       FROM snapshots
       GROUP BY source
     )
     SELECT s.source, s.item_id, s.ts, s.score, s.rank, i.title, i.url
     FROM snapshots s
     JOIN latest l ON l.source = s.source AND l.ts = s.ts
     LEFT JOIN items i ON i.source = s.source AND i.item_id = s.item_id
     ORDER BY s.source, s.rank`
  ).all<SourceRow>();
  return results ?? [];
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(v: unknown): string {
  const s = String(v ?? '');
  return /^https?:\/\//i.test(s) ? s : '';
}

function sourceLabel(source: string): string {
  const [base, region] = source.split(':');
  const label = SOURCES[base]?.label ?? base;
  if (base === 'gtrends' && region) {
    const geo = GTREND_GEOS.find((g) => g.geo === region);
    return `${label} · ${geo?.label ?? region}`;
  }
  return label;
}

function sourceHome(source: string): string {
  const [base, region] = source.split(':');
  if (base === 'hn') return 'https://news.ycombinator.com/';
  if (base === 'github') return 'https://github.com/trending?since=daily';
  if (base === 'coingecko') return 'https://www.coingecko.com/en/coins/trending';
  if (base === 'bilibili') return 'https://www.bilibili.com/v/popular/all/';
  if (base === 'baidu') return 'https://top.baidu.com/board?tab=realtime';
  if (base === 'gtrends') return `https://trends.google.com/trending?geo=${encodeURIComponent(region || 'US')}`;
  return '';
}

function groupOrder(source: string): number {
  const base = source.split(':')[0];
  return ['hn', 'github', 'coingecko', 'bilibili', 'baidu', 'gtrends'].indexOf(base);
}

export function renderSourcesPage(rows: SourceRow[], now = Date.now()): string {
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) {
    const arr = groups.get(row.source) ?? [];
    arr.push(row);
    groups.set(row.source, arr);
  }

  const keys = [...groups.keys()].sort((a, b) => {
    const d = groupOrder(a) - groupOrder(b);
    return d || a.localeCompare(b);
  });

  const sections = keys.length
    ? keys.map((source) => {
        const list = groups.get(source) ?? [];
        const official = sourceHome(source);
        const latest = list[0]?.ts ?? 0;
        const body = list.map((row) => {
          const url = safeUrl(row.url);
          const title = row.title || row.item_id;
          return `<tr>
<td class="rank">#${esc(row.rank)}</td>
<td class="title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</td>
<td class="score">${esc(fmt(Number(row.score) || 0))}</td>
<td class="action">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">查看详情 ↗</a>` : '—'}</td>
</tr>`;
        }).join('');

        return `<section class="card">
<div class="section-head">
  <div><h2>${esc(sourceLabel(source))}</h2><div class="meta">${list.length} 条 · <time data-ts="${latest}">${latest ? new Date(latest).toISOString() : '—'}</time></div></div>
  ${official ? `<a class="official" href="${esc(official)}" target="_blank" rel="noopener">官方榜单 ↗</a>` : ''}
</div>
<div class="table-wrap"><table><thead><tr><th>排名</th><th>条目</th><th class="score">热度</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
</section>`;
      }).join('')
    : `<section class="card empty"><h2>还没有快照数据</h2><p>先去控制台点一次「立即采集」。采集成功后，这里会显示每个数据源最新一轮榜单。</p></section>`;

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>x-ranking · 数据源快照</title>
<style>
*{box-sizing:border-box}:root{--bg:#f6f8fa;--card:#fff;--text:#111827;--muted:#6b7280;--line:#e5e7eb;--link:#2563eb}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;padding:28px 16px 50px}.wrap{max-width:980px;margin:auto}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:22px}h1{font-size:24px;margin:0 0 5px}h2{font-size:16px;margin:0}.sub,.meta{color:var(--muted);font-size:12px}.nav{display:flex;gap:8px;flex-wrap:wrap}.nav a,.official{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:8px 11px;color:var(--text);text-decoration:none}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:14px 0;overflow:hidden}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px 14px;border-bottom:1px solid var(--line);text-align:left}tr:last-child td{border-bottom:0}th{font-size:12px;color:var(--muted);font-weight:500}.rank{width:66px;color:var(--muted);font-variant-numeric:tabular-nums}.title{min-width:260px}.score{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.action{width:92px;white-space:nowrap}a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}.empty{padding:22px}.note{margin:0 0 16px;padding:11px 14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;color:#1e3a8a}.updated{color:var(--muted);font-size:12px;margin-top:18px}@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--card:#111827;--text:#e5e7eb;--muted:#94a3b8;--line:#334155;--link:#60a5fa}.note{background:#172554;border-color:#1e40af;color:#bfdbfe}}
</style></head><body><div class="wrap">
<div class="top"><div><h1>📊 数据源快照</h1><div class="sub">直接看最新榜单。RSS / XML / API 仅用于后台采集，不再作为阅读链接展示。</div></div><div class="nav"><a href="/">监控首页</a><a href="/admin">⚙ 控制台</a></div></div>
<p class="note">Google Trends 的后台仍使用 RSS 获取结构化数据，但每个趋势条目会跳到可读的 Google Trends Explore 页面；每个分区右上角「官方榜单」则打开对应地区的 Trending Now 页面。</p>
${sections}
<div class="updated">页面生成于 <time data-ts="${now}">${new Date(now).toISOString()}</time></div>
</div><script>(function(){var es=document.querySelectorAll('time[data-ts]'),n=Date.now();for(var i=0;i<es.length;i++){var e=es[i],t=+e.getAttribute('data-ts');if(!t)continue;var d=n-t,s=d<60000?'刚刚':d<3600000?Math.floor(d/60000)+' 分钟前':d<86400000?Math.floor(d/3600000)+' 小时前':Math.floor(d/86400000)+' 天前';e.textContent=s+' · '+new Date(t).toLocaleString()}})();</script></body></html>`;
}
