import { GTREND_GEOS, SOURCES } from './config';
import { fmt } from './notify';
import type { Env } from './types';
import { appShell, esc } from './ui';

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

function detailUrl(source: string, itemId: string): string {
  return `/item?source=${encodeURIComponent(source)}&id=${encodeURIComponent(itemId)}`;
}

function sourceIcon(source: string): string {
  const base = source.split(':')[0];
  if (base === 'hn') return 'Y';
  if (base === 'github') return '⌘';
  if (base === 'coingecko') return '◉';
  if (base === 'bilibili') return '▶';
  if (base === 'baidu') return '百';
  if (base === 'gtrends') return 'G';
  return '•';
}

function groupOrder(source: string): number {
  const base = source.split(':')[0];
  const i = ['hn', 'github', 'coingecko', 'bilibili', 'baidu', 'gtrends'].indexOf(base);
  return i < 0 ? 999 : i;
}

export function renderSourcesPage(rows: SourceRow[], now = Date.now()): string {
  const groups = new Map<string, SourceRow[]>();
  for (const row of rows) {
    const list = groups.get(row.source) ?? [];
    list.push(row);
    groups.set(row.source, list);
  }

  const keys = [...groups.keys()].sort((a, b) => {
    const d = groupOrder(a) - groupOrder(b);
    return d || a.localeCompare(b);
  });

  const chips = keys.length
    ? `<div class="chips" id="sourceFilters"><button class="chip active" data-filter="all">全部</button>${keys.map((source) => `<button class="chip" data-filter="${esc(source)}">${esc(sourceLabel(source))}</button>`).join('')}</div>`
    : '';

  const sections = keys.length
    ? keys.map((source) => {
        const list = groups.get(source) ?? [];
        const official = sourceHome(source);
        const latest = list[0]?.ts ?? 0;
        const rowsHtml = list.map((row) => {
          const detail = detailUrl(row.source, row.item_id);
          const title = row.title || row.item_id;
          return `<tr>
<td class="rank">#${esc(row.rank)}</td>
<td class="title-cell"><a class="link" href="${esc(detail)}">${esc(title)}</a><div class="row-hint">在站内查看历史走势与异动</div></td>
<td class="num score">${esc(fmt(Number(row.score) || 0))}</td>
<td class="num"><a class="btn small" href="${esc(detail)}">查看走势 →</a></td>
</tr>`;
        }).join('');

        return `<section class="panel source-section" data-source="${esc(source)}" id="source-${esc(source.replace(/[^a-zA-Z0-9_-]/g, '-'))}">
<div class="panel-head source-head">
  <div class="source-name"><span class="source-icon">${sourceIcon(source)}</span><div><div class="strong">${esc(sourceLabel(source))}</div><div class="source-meta">${list.length} 条 · ${latest ? `<time data-ts="${latest}">${new Date(latest).toISOString()}</time>` : '暂无更新时间'}</div></div></div>
  ${official ? `<a class="btn small" href="${esc(official)}" target="_blank" rel="noopener">官方榜单 ↗</a>` : ''}
</div>
<div class="table-wrap"><table class="table"><thead><tr><th>排名</th><th>条目</th><th class="num">热度</th><th class="num">操作</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
</section>`;
      }).join('')
    : `<section class="panel"><div class="empty"><div class="empty-icon">📭</div><strong>还没有榜单快照</strong><div>先在控制台点一次「立即采集」，这里就会自动出现每个数据源的最新榜单。</div><a class="btn primary" href="/admin#actions">去控制台采集</a></div></section>`;

  const body = `<style>.row-hint{font-size:11px;color:var(--muted);margin-top:2px}</style>
<section class="hero">
<div class="hero-copy"><div class="eyebrow">Live Sources</div><h1>当前最热，先在站内看清走势。</h1><p>点击标题不会再突然跳到 Google Trends 或其他外站。先看自己的历史曲线、排名和异动，需要时再从详情页打开官方页面。</p></div>
<div class="hero-actions"><a class="btn primary" href="/admin#actions">▶ 立即刷新数据</a><a class="btn" href="/">返回总览</a></div>
</section>
<div class="panel" style="margin-bottom:16px"><div class="panel-body"><div class="form-row" style="justify-content:space-between"><div><div class="strong">筛选数据源</div><div class="muted" style="font-size:12px;margin-top:3px">点击即可只看某一类，不需要滚很长的页面。</div></div>${chips}</div></div></div>
${sections}
<div class="muted" style="font-size:12px;margin-top:16px">页面生成：<time data-ts="${now}">${new Date(now).toISOString()}</time></div>`;

  const script = `(function(){
var box=document.getElementById('sourceFilters'); if(!box) return;
var buttons=box.querySelectorAll('[data-filter]'),sections=document.querySelectorAll('[data-source]');
for(var i=0;i<buttons.length;i++) buttons[i].addEventListener('click',function(){
  var f=this.getAttribute('data-filter');
  for(var j=0;j<buttons.length;j++) buttons[j].classList.toggle('active',buttons[j]===this);
  for(var k=0;k<sections.length;k++) sections[k].style.display=(f==='all'||sections[k].getAttribute('data-source')===f)?'':'none';
});
})();`;

  return appShell({ title: 'Trend Radar · 当前榜单', active: 'sources', body, script });
}
