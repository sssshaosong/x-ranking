import { GTREND_GEOS, KEEP_DAYS, SOURCES } from './config';
import { fmt } from './notify';
import { appShell, esc, safeUrl } from './ui';

type Row = Record<string, string | number | null>;

export interface StatusData {
  runs: Row[];
  alerts: Row[];
  tgConfigured: boolean;
  now: number;
  schedule: {
    enabled: boolean;
    intervalMinutes: number;
    nextRunAt: number | null;
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

function timeCell(ts: number): string {
  return `<td class="nowrap"><time data-ts="${ts}">${esc(new Date(ts).toISOString())}</time></td>`;
}

function alertRow(a: Row): string {
  const ts = Number(a.ts);
  const kind = String(a.kind);
  const ratio = Number(a.ratio) || 0;
  const title = a.title ?? a.item_id ?? '(未知条目)';
  const url = safeUrl(a.url);
  const kindBadge = kind === 'new-entry'
    ? '<span class="badge info">🆕 新上榜</span>'
    : '<span class="badge hot">🔥 提速</span>';
  const ratioText = kind === 'velocity' && ratio ? `${ratio.toFixed(1)}×` : '—';
  return `<tr>
${timeCell(ts)}
<td>${kindBadge}</td>
<td class="nowrap">${esc(sourceLabel(String(a.source)))}</td>
<td class="title-cell">${url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</td>
<td class="num strong">${esc(fmt(Number(a.score) || 0))}</td>
<td class="num">${esc(ratioText)}</td>
</tr>`;
}

function runRow(r: Row): string {
  const ts = Number(r.ts);
  const errors = String(r.errors ?? '').trim();
  const errorCount = errors ? errors.split(' | ').length : 0;
  return `<tr>
${timeCell(ts)}
<td>${errors ? `<span class="status-pill warn">${errorCount} 项错误</span>` : '<span class="status-pill ok">正常</span>'}</td>
<td class="num">${esc(r.polled ?? 0)}</td>
<td class="num">${esc(r.alerts ?? 0)}</td>
<td class="num">${esc(r.notified ?? 0)}</td>
<td class="error-text">${errors ? esc(errors.length > 110 ? errors.slice(0, 110) + '…' : errors) : '<span class="muted">—</span>'}</td>
</tr>`;
}

export function renderStatusPage(data: StatusData): string {
  const { runs, alerts, tgConfigured, now, schedule } = data;
  const enabledSources = Object.values(SOURCES).filter((s) => s.enabled).length;
  const latest = runs[0];
  const latestErrors = String(latest?.errors ?? '').trim();
  const latestTs = Number(latest?.ts) || 0;
  const dayAgo = now - 24 * 3600_000;
  const alerts24 = alerts.filter((a) => Number(a.ts) >= dayAgo).length;
  const notified24 = runs
    .filter((r) => Number(r.ts) >= dayAgo)
    .reduce((sum, r) => sum + (Number(r.notified) || 0), 0);

  const state = !latest
    ? { cls: 'idle', text: '等待首次运行' }
    : latestErrors
      ? { cls: 'warn', text: `最近一轮有 ${latestErrors.split(' | ').length} 项错误` }
      : { cls: 'ok', text: '运行正常' };

  const scheduleLabel = schedule.enabled ? `每 ${schedule.intervalMinutes} 分钟` : '已暂停';
  const nextRun = schedule.enabled && schedule.nextRunAt
    ? `<time data-ts="${schedule.nextRunAt}">${new Date(schedule.nextRunAt).toISOString()}</time>`
    : '—';

  const hero = `<section class="hero">
<div class="hero-copy">
  <div class="eyebrow">Overview</div>
  <h1>今天发生了什么，一眼看清。</h1>
  <p>这里专注展示异动、运行健康和推送状态。想看完整榜单去「当前榜单」，想手动运行或改定时去「控制台」。</p>
</div>
<div class="hero-actions">
  <a class="btn primary" href="/sources">▦ 查看当前榜单</a>
  <a class="btn" href="/admin#actions">▶ 立即采集</a>
  <a class="btn" href="/admin#schedule">⏱ 定时设置</a>
</div>
</section>`;

  const stats = `<div class="grid stat-grid">
<div class="stat"><div class="label">近 24 小时异动</div><div class="value">${alerts24}</div><div class="meta">符合阈值的热点变化</div></div>
<div class="stat"><div class="label">近 24 小时推送</div><div class="value">${notified24}</div><div class="meta">已发送到 Telegram</div></div>
<div class="stat"><div class="label">当前数据源</div><div class="value">${enabledSources}</div><div class="meta">持续采集与建立基线</div></div>
<div class="stat"><div class="label">自动运行</div><div class="value" style="font-size:22px">${esc(scheduleLabel)}</div><div class="meta">下次预计：${nextRun}</div></div>
</div>`;

  const alertsPanel = `<section class="panel">
<div class="panel-head"><div class="panel-title">🔥 最近异动 <span class="hint muted">只展示真正值得关注的变化</span></div><a class="btn small" href="/sources">看完整榜单</a></div>
${alerts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>时间</th><th>类型</th><th>来源</th><th>条目</th><th class="num">热度</th><th class="num">倍数</th></tr></thead><tbody>${alerts.slice(0, 16).map(alertRow).join('')}</tbody></table></div>` : `<div class="empty"><div class="empty-icon">🌱</div><strong>还没有异动告警</strong><div>冷启动期间会先积累历史快照；你仍然可以先查看所有数据源的当前榜单。</div><a class="btn primary" href="/sources">查看当前榜单</a></div>`}
</section>`;

  const latestPanel = `<section class="panel">
<div class="panel-head"><div class="panel-title">运行健康</div><span class="status-pill ${state.cls}">${esc(state.text)}</span></div>
<div class="panel-body">
  <div class="result-grid">
    <div class="mini-stat"><div class="k">最近采集</div><div class="v">${esc(latest?.polled ?? 0)}</div></div>
    <div class="mini-stat"><div class="k">最近异动</div><div class="v">${esc(latest?.alerts ?? 0)}</div></div>
    <div class="mini-stat"><div class="k">最近推送</div><div class="v">${esc(latest?.notified ?? 0)}</div></div>
    <div class="mini-stat"><div class="k">Telegram</div><div class="v" style="font-size:17px">${tgConfigured ? '已连接' : '未配置'}</div></div>
  </div>
  <div class="divider"></div>
  <div class="form-row" style="justify-content:space-between">
    <div class="muted">${latestTs ? `最近运行：<time data-ts="${latestTs}">${new Date(latestTs).toISOString()}</time>` : '尚未完成首次运行'}</div>
    <a class="btn small" href="/admin#actions">打开控制台</a>
  </div>
</div>
${latestErrors ? `<div class="panel-foot" style="color:var(--warn)">最近错误：${esc(latestErrors)}</div>` : `<div class="panel-foot">快照保留 ${KEEP_DAYS} 天，用于计算历史基线。</div>`}
</section>`;

  const runsPanel = `<section class="panel">
<div class="panel-head"><div class="panel-title">最近运行记录 <span class="hint muted">用于快速判断采集是否稳定</span></div></div>
${runs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>时间</th><th>状态</th><th class="num">采集</th><th class="num">异动</th><th class="num">推送</th><th>错误摘要</th></tr></thead><tbody>${runs.slice(0, 8).map(runRow).join('')}</tbody></table></div>` : `<div class="empty"><div class="empty-icon">⏳</div><strong>还没有运行记录</strong><div>去控制台点一次「立即采集」，不需要再手动拼接 URL。</div><a class="btn primary" href="/admin#actions">去控制台运行</a></div>`}
</section>`;

  return appShell({
    title: 'Trend Radar · 总览',
    active: 'overview',
    body: `${hero}${stats}<div class="split"><div>${alertsPanel}</div><div class="stack">${latestPanel}</div></div><div style="height:16px"></div>${runsPanel}`,
  });
}
