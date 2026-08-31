import { GTREND_GEOS, SOURCES } from './config';
import { fmt } from './notify';
import type { Env } from './types';
import { appShell, esc, safeUrl } from './ui';

type ItemRow = {
  source: string;
  item_id: string;
  title: string | null;
  url: string | null;
  first_seen: number;
  last_seen: number;
};

type Point = { ts: number; score: number; rank: number };
type AlertRow = { ts: number; kind: string; ratio: number; rate: number; score: number };

export interface ItemDetail {
  item: ItemRow;
  points: Point[];
  alerts: AlertRow[];
}

export async function loadItemDetail(env: Env, source: string, itemId: string): Promise<ItemDetail | null> {
  const item = await env.DB.prepare(
    'SELECT source, item_id, title, url, first_seen, last_seen FROM items WHERE source = ? AND item_id = ?'
  )
    .bind(source, itemId)
    .first<ItemRow>();
  if (!item) return null;

  const [snapshots, alerts] = await Promise.all([
    env.DB.prepare(
      'SELECT ts, score, rank FROM snapshots WHERE source = ? AND item_id = ? ORDER BY ts DESC LIMIT 240'
    )
      .bind(source, itemId)
      .all<Point>(),
    env.DB.prepare(
      'SELECT ts, kind, ratio, rate, score FROM alerts WHERE source = ? AND item_id = ? ORDER BY ts DESC LIMIT 20'
    )
      .bind(source, itemId)
      .all<AlertRow>(),
  ]);

  return {
    item,
    points: (snapshots.results ?? []).reverse(),
    alerts: alerts.results ?? [],
  };
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

function chart(points: Point[]): string {
  if (!points.length) {
    return '<div class="empty"><div class="empty-icon">↗</div><strong>还没有走势数据</strong><div>等下一轮采集后，这里会逐步形成历史曲线。</div></div>';
  }

  const W = 920;
  const H = 270;
  const PAD_X = 26;
  const PAD_Y = 28;
  const scores = points.map((p) => Number(p.score) || 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(1, max - min);
  const x = (i: number) => PAD_X + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - PAD_X * 2));
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${H - PAD_Y} L ${x(0).toFixed(1)} ${H - PAD_Y} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const change = first && first.score ? ((last.score - first.score) / Math.abs(first.score)) * 100 : 0;

  return `<div class="chart-meta"><div><span class="muted">区间最低</span><b>${esc(fmt(min))}</b></div><div><span class="muted">区间最高</span><b>${esc(fmt(max))}</b></div><div><span class="muted">区间变化</span><b>${change >= 0 ? '+' : ''}${esc(change.toFixed(1))}%</b></div></div>
<div class="trend-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="热度走势">
  <defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".28"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
  <line x1="${PAD_X}" y1="${PAD_Y}" x2="${PAD_X}" y2="${H - PAD_Y}" stroke="var(--line)"/>
  <line x1="${PAD_X}" y1="${H - PAD_Y}" x2="${W - PAD_X}" y2="${H - PAD_Y}" stroke="var(--line)"/>
  <path d="${area}" fill="url(#trendFill)"/>
  <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.score).toFixed(1)}" r="6" fill="var(--brand)" stroke="var(--surface)" stroke-width="3"/>
</svg></div>`;
}

function snapshotRows(points: Point[]): string {
  const recent = [...points].reverse().slice(0, 20);
  if (!recent.length) return '<div class="empty">暂无采样记录</div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>采样时间</th><th class="num">热度</th><th class="num">排名</th></tr></thead><tbody>${recent
    .map(
      (p) => `<tr><td><time data-ts="${p.ts}">${new Date(p.ts).toISOString()}</time></td><td class="num strong">${esc(fmt(Number(p.score) || 0))}</td><td class="num">${p.rank > 0 ? '#' + esc(p.rank) : '—'}</td></tr>`
    )
    .join('')}</tbody></table></div>`;
}

function alertRows(alerts: AlertRow[]): string {
  if (!alerts.length) return '<div class="empty"><div class="empty-icon">✓</div><strong>暂时没有异动记录</strong><div>这代表它还没有达到当前告警阈值。</div></div>';
  return `<div class="table-wrap"><table class="table"><thead><tr><th>时间</th><th>类型</th><th class="num">热度</th><th class="num">倍数</th></tr></thead><tbody>${alerts
    .map((a) => `<tr><td><time data-ts="${a.ts}">${new Date(a.ts).toISOString()}</time></td><td><span class="status-pill ${a.kind === 'new-entry' ? 'info' : 'warn'}">${a.kind === 'new-entry' ? '新上榜' : '提速'}</span></td><td class="num">${esc(fmt(Number(a.score) || 0))}</td><td class="num strong">${a.kind === 'velocity' && a.ratio ? esc(Number(a.ratio).toFixed(1)) + '×' : '—'}</td></tr>`)
    .join('')}</tbody></table></div>`;
}

export function renderItemDetail(detail: ItemDetail): string {
  const { item, points, alerts } = detail;
  const latest = points[points.length - 1];
  const first = points[0];
  const external = safeUrl(item.url);
  const currentScore = latest?.score ?? 0;
  const currentRank = latest?.rank ?? 0;
  const sampleCount = points.length;
  const firstScore = first?.score ?? 0;
  const change = firstScore ? ((currentScore - firstScore) / Math.abs(firstScore)) * 100 : 0;
  const title = item.title || item.item_id;

  const body = `<section class="hero detail-hero">
<div class="hero-copy"><div class="eyebrow">Trend Detail</div><div class="detail-source">${esc(sourceLabel(item.source))}</div><h1>${esc(title)}</h1><p>先在 x-ranking 内看完整走势和历史；只有你主动点击官方按钮时才会离开本站。</p></div>
<div class="hero-actions"><a class="btn" href="/sources">← 返回当前榜单</a>${external ? `<a class="btn primary" href="${esc(external)}" target="_blank" rel="noopener">打开官方页面 ↗</a>` : ''}</div>
</section>

<div class="metric-grid detail-metrics">
  <div class="metric"><div class="metric-label">当前热度</div><div class="metric-value">${esc(fmt(currentScore))}</div><div class="metric-sub">最近一次采样</div></div>
  <div class="metric"><div class="metric-label">当前排名</div><div class="metric-value">${currentRank > 0 ? '#' + esc(currentRank) : '—'}</div><div class="metric-sub">该数据源内排名</div></div>
  <div class="metric"><div class="metric-label">区间变化</div><div class="metric-value">${change >= 0 ? '+' : ''}${esc(change.toFixed(1))}%</div><div class="metric-sub">相对当前保留窗口首个采样</div></div>
  <div class="metric"><div class="metric-label">历史采样</div><div class="metric-value">${esc(sampleCount)}</div><div class="metric-sub">最多展示最近 240 个点</div></div>
</div>

<section class="panel"><div class="panel-head"><div><div class="panel-title">热度走势</div><div class="hint muted">由你自己的 D1 快照绘制，不依赖 Google Trends 页面是否能正常加载。</div></div>${latest ? `<span class="status-pill ok"><time data-ts="${latest.ts}">${new Date(latest.ts).toISOString()}</time></span>` : ''}</div><div class="panel-body">${chart(points)}</div></section>

<div class="detail-columns">
<section class="panel"><div class="panel-head"><div class="panel-title">最近采样</div><span class="hint muted">最近 20 条</span></div>${snapshotRows(points)}</section>
<section class="panel"><div class="panel-head"><div class="panel-title">异动记录</div><span class="hint muted">最近 20 条</span></div>${alertRows(alerts)}</section>
</div>`;

  const extraStyle = `<style>
.detail-source{display:inline-flex;padding:5px 10px;border-radius:999px;background:var(--brand-soft);color:var(--brand);font-weight:700;font-size:12px;margin:8px 0 4px}.detail-hero h1{max-width:900px}.detail-metrics{margin-top:0}.chart-meta{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:12px}.chart-meta div{display:flex;flex-direction:column;gap:2px}.chart-meta b{font-size:16px}.trend-chart{width:100%;overflow:hidden;border-radius:14px;background:linear-gradient(180deg,var(--surface-2),transparent);padding:4px}.trend-chart svg{display:block;width:100%;height:auto}.detail-columns{display:grid;grid-template-columns:1.15fr .85fr;gap:16px}.detail-columns .panel{margin:0}@media(max-width:820px){.detail-columns{grid-template-columns:1fr}}
</style>`;

  return appShell({ title: `${title} · Trend Radar`, active: 'sources', body: extraStyle + body });
}

export function renderItemNotFound(): string {
  const body = `<section class="hero"><div class="hero-copy"><div class="eyebrow">Not Found</div><h1>这个条目还没有可展示的数据。</h1><p>可能是它已经被清理，或者链接来自旧版本缓存。</p></div><div class="hero-actions"><a class="btn primary" href="/sources">返回当前榜单</a></div></section>`;
  return appShell({ title: '条目不存在 · Trend Radar', active: 'sources', body });
}
