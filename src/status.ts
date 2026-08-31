/**
 * 状态页渲染。独立成模块的原因：
 *  1) index.ts 保持薄，只做路由
 *  2) 纯函数可以单测（转义、空态、健康判定）
 *  3) 离线生成带模拟数据的预览，部署前就能看到 UI 效果
 *
 * 设计约定：
 *  - 服务端渲染完整 HTML，不依赖 JS 也能看（时间降级显示 UTC）
 *  - <time data-ts> 由页尾小脚本转成本地时区的相对时间
 *  - 所有来自外部站点的字段（标题、URL）必须 esc()，URL 还要过 safeUrl()
 */
import { GTREND_GEOS, KEEP_DAYS, SOURCES } from './config';
import { fmt } from './notify';

type Row = Record<string, string | number | null>;

export interface StatusData {
  /** 最近运行记录，ts 降序。用于健康判定、统计和表格 */
  runs: Row[];
  /** 最近异动记录，ts 降序 */
  alerts: Row[];
  /** Telegram 推送通道是否已配置（不泄露值，只显示有无） */
  tgConfigured: boolean;
  now: number;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 服务端兜底时间：UTC。有 JS 时会被替换成本地相对时间。 */
function utc(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** 'gtrends:TW' → 'Google Trends · 中文区(台)'，其余直接用配置里的中文标签 */
function sourceLabel(source: string): string {
  const [base, region] = source.split(':');
  const label = SOURCES[base]?.label ?? base;
  if (base === 'gtrends' && region) {
    const geo = GTREND_GEOS.find((g) => g.geo === region);
    return `${label} · ${geo?.label ?? region}`;
  }
  return label;
}

/** 标题来自外部站点，只放行 http(s) 链接，防止 javascript: 注入 */
function safeUrl(u: unknown): string {
  const s = String(u ?? '');
  return /^https?:\/\//i.test(s) ? s : '';
}

function timeCell(ts: number): string {
  return `<td class="nowrap"><time data-ts="${ts}">${esc(utc(ts))}</time></td>`;
}

/** 异动类型徽章 */
function kindCell(kind: string): string {
  if (kind === 'new-entry') return '<td><span class="badge b-new">🆕 新上榜</span></td>';
  return `<td><span class="badge b-vel">🔥 提速</span></td>`;
}

function ratioCell(kind: string, ratio: number): string {
  if (kind !== 'velocity' || !ratio) return '<td class="num dim">—</td>';
  const cls = ratio >= 5 ? 'r3' : ratio >= 3 ? 'r2' : 'r1';
  return `<td class="num ${cls}">${ratio.toFixed(1)}×</td>`;
}

function alertRow(a: Row): string {
  const ts = Number(a.ts);
  const kind = String(a.kind);
  const ratio = Number(a.ratio) || 0;
  const title = a.title ?? a.item_id ?? '(未知条目)';
  const url = safeUrl(a.url);
  const titleHtml = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>`
    : esc(title);
  return (
    `<tr>${timeCell(ts)}${kindCell(kind)}` +
    `<td class="nowrap">${esc(sourceLabel(String(a.source)))}</td>` +
    `<td class="t-title">${titleHtml}</td>` +
    `<td class="num">${esc(fmt(Number(a.score) || 0))}</td>` +
    `${ratioCell(kind, ratio)}</tr>`
  );
}

function runRow(r: Row): string {
  const ts = Number(r.ts);
  const errs = String(r.errors ?? '').trim();
  const errCount = errs ? errs.split(' | ').length : 0;
  const status = errs
    ? `<td class="nowrap"><span class="dot bad"></span>${errCount} 项错误</td>`
    : '<td class="nowrap"><span class="dot ok"></span>正常</td>';
  const errCell = errs
    ? `<td class="err" title="${esc(errs)}">${esc(errs.length > 60 ? errs.slice(0, 60) + '…' : errs)}</td>`
    : '<td class="err dim">—</td>';
  return (
    `<tr>${timeCell(ts)}${status}` +
    `<td class="num">${esc(r.polled ?? 0)}</td>` +
    `<td class="num">${esc(r.alerts ?? 0)}</td>` +
    `<td class="num">${esc(r.notified ?? 0)}</td>` +
    `${errCell}</tr>`
  );
}

const TIME_JS = `(function(){
var els=document.querySelectorAll('time[data-ts]');
var now=Date.now();
for(var i=0;i<els.length;i++){
var el=els[i],ts=+el.getAttribute('data-ts');
if(!ts)continue;
var d=now-ts,rel;
if(d<0)rel='即将';
else if(d<60000)rel='刚刚';
else if(d<3600000)rel=Math.floor(d/60000)+' 分钟前';
else if(d<86400000)rel=Math.floor(d/3600000)+' 小时前';
else rel=Math.floor(d/86400000)+' 天前';
var t=new Date(ts),p=function(n){return(n<10?'0':'')+n};
el.textContent=rel+' · '+(t.getMonth()+1)+'-'+p(t.getDate())+' '+p(t.getHours())+':'+p(t.getMinutes());
}
})();`;

const CSS = `*{box-sizing:border-box}
:root{--bg:#f7f9fa;--card:#fff;--text:#0f1419;--muted:#5b7083;--line:#e6e9ea;--accent:#1d9bf0;--ok:#00a670;--warn:#e8833a;--hot:#e0245e;--amber:#d99000}
@media(prefers-color-scheme:dark){:root{--bg:#101821;--card:#18222e;--text:#e7e9ea;--muted:#8b98a5;--line:#2a3644;--accent:#4ab3f4;--ok:#00ba7c;--warn:#f4a71d;--hot:#ff6584;--amber:#ffca44}}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;padding:28px 16px 48px}
.wrap{max-width:940px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:22px}
h1{font-size:20px;margin:0 0 6px}
.sub{margin:0;color:var(--muted);font-size:13px}
.pill{display:inline-flex;align-items:center;gap:7px;padding:5px 13px;border-radius:99px;font-size:13px;font-weight:600;white-space:nowrap}
.pill::before{content:'';width:8px;height:8px;border-radius:50%;background:currentColor}
.pill.ok{color:var(--ok);background:rgba(0,186,124,.12)}
.pill.warn{color:var(--warn);background:rgba(244,167,29,.14)}
.pill.idle{color:var(--muted);background:rgba(139,152,165,.14)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:30px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card .v{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.card .k{color:var(--muted);font-size:12px;margin-top:3px}
section{margin-bottom:30px}
h2{font-size:15px;margin:0 0 10px}
.tblwrap{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%}
th{color:var(--muted);font-size:12px;font-weight:500;text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}
tr:last-child td{border-bottom:none}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.nowrap{white-space:nowrap}
.dim{color:var(--muted)}
.t-title{min-width:200px;max-width:380px;word-break:break-word}
.badge{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12px;white-space:nowrap}
.b-vel{color:var(--hot);background:rgba(224,36,94,.11)}
.b-new{color:var(--accent);background:rgba(29,155,240,.11)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot.ok{background:var(--ok)}.dot.bad{background:var(--warn)}
.r1{color:var(--amber);font-weight:600}
.r2{color:var(--warn);font-weight:700}
.r3{color:var(--hot);font-weight:700}
.err{color:var(--warn);font-size:12px;max-width:240px;word-break:break-all}
.empty{padding:26px 16px;text-align:center;color:var(--muted);font-size:13px;line-height:1.9}
footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;line-height:2}
footer .warnline{color:var(--warn)}
code{background:rgba(129,140,150,.15);padding:1px 5px;border-radius:4px;font-size:12px}`;

export function renderStatusPage(data: StatusData): string {
  const { runs, alerts, tgConfigured, now } = data;

  const enabled = Object.values(SOURCES).filter((s) => s.enabled);
  const latest = runs[0];
  const latestErrs = String(latest?.errors ?? '').trim();

  const pill = !latest
    ? '<span class="pill idle">等待首次运行</span>'
    : latestErrs
      ? `<span class="pill warn">最近一轮有 ${latestErrs.split(' | ').length} 项错误</span>`
      : '<span class="pill ok">运行正常</span>';

  const dayAgo = now - 24 * 3600_000;
  const alerts24 = alerts.filter((a) => Number(a.ts) >= dayAgo).length;
  const notified24 = runs
    .filter((r) => Number(r.ts) >= dayAgo)
    .reduce((n, r) => n + (Number(r.notified) || 0), 0);

  const lastRunLine = latest
    ? `最近一轮：<time data-ts="${Number(latest.ts)}">${esc(utc(Number(latest.ts)))}</time>`
    : '尚未运行';

  const cards = [
    { v: alerts24, k: '近 24 小时异动' },
    { v: notified24, k: '近 24 小时推送' },
    { v: enabled.length, k: '数据源 · 每 20 分钟一轮' },
    { v: KEEP_DAYS + ' 天', k: '快照保留（用于算基线）' },
  ]
    .map((c) => `<div class="card"><div class="v">${esc(c.v)}</div><div class="k">${esc(c.k)}</div></div>`)
    .join('');

  const alertsHtml = alerts.length
    ? `<div class="tblwrap"><table>
<tr><th>时间</th><th>类型</th><th>来源</th><th>条目</th><th>当前热度</th><th style="text-align:right">倍数</th></tr>
${alerts.map(alertRow).join('\n')}
</table></div>`
    : `<div class="tblwrap"><div class="empty">暂无异动<br><span class="dim">冷启动前几个小时没有告警是正常现象——需要先积累 24 小时基线数据才能判定「提速」。</span></div></div>`;

  const runsHtml = runs.length
    ? `<div class="tblwrap"><table>
<tr><th>时间</th><th>状态</th><th style="text-align:right">采集</th><th style="text-align:right">异动</th><th style="text-align:right">推送</th><th>错误</th></tr>
${runs.slice(0, 10).map(runRow).join('\n')}
</table></div>`
    : `<div class="tblwrap"><div class="empty">暂无运行记录<br><span class="dim">部署完成后每 20 分钟自动运行一次；也可以访问 <code>/run?token=…</code> 手动触发第一次。</span></div></div>`;

  const tgLine = tgConfigured
    ? '推送通道：<b>已配置</b>'
    : '<span class="warnline">推送通道：<b>未配置</b> —— 需设置 <code>TELEGRAM_BOT_TOKEN</code> 和 <code>TELEGRAM_CHAT_ID</code> 两个 secret 后才会推送</span>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trend Radar · 热点异动监控</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header>
  <div>
    <h1>📡 Trend Radar</h1>
    <p class="sub">热点异动监控 · 每 20 分钟采集一轮 · ${esc(enabled.length)} 个数据源</p>
    <p class="sub">只在「相对自身明显提速」或「首次上榜即高位」时推送到 Telegram · ${lastRunLine}</p>
  </div>
  ${pill}
</header>

<div class="cards">${cards}</div>

<section>
<h2>最近异动</h2>
${alertsHtml}
</section>

<section>
<h2>最近运行</h2>
${runsHtml}
</section>

<footer>
<div>${tgLine}</div>
<div>手动触发 <code>/run?token=…</code> · 通道自检 <code>/test?token=…</code> · 倍数 = 近 1 小时增速 ÷ 24 小时自身基线</div>
</footer>
</div>
<script>${TIME_JS}</script>
</body>
</html>`;
}
