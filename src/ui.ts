export type ActivePage = 'overview' | 'sources' | 'admin';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function safeUrl(value: unknown): string {
  const s = String(value ?? '');
  return /^https?:\/\//i.test(s) ? s : '';
}

const CSS = `
*{box-sizing:border-box}
:root{
  color-scheme:light dark;
  --bg:#f5f7fb;--surface:#ffffff;--surface-2:#f8fafc;--text:#111827;--muted:#667085;
  --line:#e4e7ec;--line-strong:#d0d5dd;--brand:#4f46e5;--brand-2:#7c3aed;--brand-soft:#eef2ff;
  --success:#067647;--success-soft:#ecfdf3;--warn:#b54708;--warn-soft:#fffaeb;--danger:#b42318;--danger-soft:#fef3f2;
  --info:#175cd3;--info-soft:#eff8ff;--shadow:0 14px 38px rgba(16,24,40,.07);--shadow-sm:0 2px 8px rgba(16,24,40,.05)
}
@media(prefers-color-scheme:dark){:root{
  --bg:#0b1020;--surface:#111827;--surface-2:#182230;--text:#f8fafc;--muted:#98a2b3;
  --line:#273244;--line-strong:#344054;--brand:#818cf8;--brand-2:#a78bfa;--brand-soft:#25264a;
  --success:#47cd89;--success-soft:#163b2d;--warn:#fdb022;--warn-soft:#3b2c15;--danger:#f97066;--danger-soft:#3c1e21;
  --info:#84adff;--info-soft:#172b4d;--shadow:0 18px 50px rgba(0,0,0,.28);--shadow-sm:0 3px 12px rgba(0,0,0,.22)
}}
html{scroll-behavior:smooth}
body{margin:0;background:
  radial-gradient(900px 480px at 8% -10%,rgba(99,102,241,.13),transparent 56%),
  radial-gradient(900px 480px at 96% 0%,rgba(168,85,247,.09),transparent 52%),var(--bg);
  color:var(--text);font:14px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
a{color:inherit}.shell{width:min(1120px,calc(100% - 32px));margin:0 auto}
.appbar{position:sticky;top:0;z-index:50;border-bottom:1px solid color-mix(in srgb,var(--line) 86%,transparent);background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(16px)}
.appbar-inner{height:70px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;min-width:0}.brand-mark{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:#fff;font-size:18px;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 8px 22px rgba(79,70,229,.22)}
.brand-copy{display:flex;flex-direction:column;min-width:0}.brand-copy strong{font-size:15px;letter-spacing:.1px;white-space:nowrap}.brand-copy span{font-size:11px;color:var(--muted);white-space:nowrap}
.nav{display:flex;gap:5px;padding:4px;border:1px solid var(--line);background:var(--surface);border-radius:12px;box-shadow:var(--shadow-sm)}
.nav a{text-decoration:none;padding:8px 13px;border-radius:9px;color:var(--muted);font-weight:600;font-size:13px;white-space:nowrap}.nav a:hover{color:var(--text);background:var(--surface-2)}.nav a.active{color:var(--brand);background:var(--brand-soft)}
.page{padding:34px 0 56px}.hero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}.hero-copy{max-width:760px}.eyebrow{color:var(--brand);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.hero h1{font-size:30px;line-height:1.22;margin:0 0 9px;letter-spacing:-.03em}.hero p{margin:0;color:var(--muted);font-size:14px;max-width:700px}.hero-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}
.btn{appearance:none;border:1px solid var(--line-strong);background:var(--surface);color:var(--text);border-radius:10px;padding:9px 13px;display:inline-flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;font-weight:700;font-size:13px;cursor:pointer;transition:.16s ease;box-shadow:0 1px 1px rgba(16,24,40,.02)}.btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--brand) 35%,var(--line-strong));box-shadow:var(--shadow-sm)}.btn:disabled{opacity:.52;cursor:not-allowed;transform:none}.btn.primary{border-color:transparent;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));box-shadow:0 8px 20px rgba(79,70,229,.18)}.btn.success{border-color:transparent;color:#fff;background:#087f5b}.btn.danger{border-color:var(--danger);color:var(--danger);background:var(--surface)}.btn.small{padding:6px 9px;font-size:12px;border-radius:8px}
.grid{display:grid;gap:14px}.stat-grid{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:24px}.stat{background:color-mix(in srgb,var(--surface) 94%,transparent);border:1px solid var(--line);border-radius:16px;padding:17px 18px;box-shadow:var(--shadow-sm)}.stat .label{font-size:12px;color:var(--muted);margin-bottom:7px}.stat .value{font-size:27px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.stat .meta{font-size:12px;color:var(--muted);margin-top:5px}
.panel{background:color-mix(in srgb,var(--surface) 97%,transparent);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-sm);overflow:hidden}.panel + .panel{margin-top:16px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)}.panel-title{display:flex;align-items:center;gap:9px;font-weight:800}.panel-title .hint{font-weight:500}.panel-body{padding:18px}.panel-foot{padding:12px 18px;border-top:1px solid var(--line);background:var(--surface-2);color:var(--muted);font-size:12px}
.split{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.8fr);gap:16px}.stack{display:grid;gap:16px}
.status-pill,.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-weight:700;white-space:nowrap}.status-pill{padding:6px 10px;font-size:12px}.status-pill:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.status-pill.ok{color:var(--success);background:var(--success-soft)}.status-pill.warn{color:var(--warn);background:var(--warn-soft)}.status-pill.bad{color:var(--danger);background:var(--danger-soft)}.status-pill.idle{color:var(--muted);background:var(--surface-2)}
.badge{padding:3px 8px;font-size:11px}.badge.info{color:var(--info);background:var(--info-soft)}.badge.hot{color:#c11574;background:#fdf2fa}.badge.ok{color:var(--success);background:var(--success-soft)}.badge.warn{color:var(--warn);background:var(--warn-soft)}
.table-wrap{overflow:auto}.table{width:100%;border-collapse:collapse}.table th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;text-align:left;padding:10px 14px;background:var(--surface-2);border-bottom:1px solid var(--line);white-space:nowrap}.table td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:top}.table tr:last-child td{border-bottom:0}.table tbody tr:hover{background:color-mix(in srgb,var(--brand-soft) 38%,transparent)}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.nowrap{white-space:nowrap}.muted{color:var(--muted)}.strong{font-weight:700}.link{color:var(--brand);text-decoration:none;font-weight:650}.link:hover{text-decoration:underline}.title-cell{min-width:260px;max-width:470px;word-break:break-word}.error-text{color:var(--warn);font-size:12px;max-width:340px;word-break:break-word}
.empty{padding:34px 22px;text-align:center;color:var(--muted)}.empty-icon{font-size:30px;margin-bottom:8px}.empty strong{display:block;color:var(--text);font-size:15px;margin-bottom:4px}.empty .btn{margin-top:14px}
.notice{border:1px solid color-mix(in srgb,var(--info) 30%,var(--line));background:var(--info-soft);color:var(--info);border-radius:12px;padding:11px 13px;font-size:12px}.notice.warn{background:var(--warn-soft);color:var(--warn);border-color:color-mix(in srgb,var(--warn) 28%,var(--line))}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer}.chip:hover,.chip.active{color:var(--brand);background:var(--brand-soft);border-color:color-mix(in srgb,var(--brand) 28%,var(--line))}
.form-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.field{display:grid;gap:6px}.field label{font-size:12px;color:var(--muted);font-weight:700}input,select{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;padding:9px 11px;outline:none}input:focus,select:focus{border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 14%,transparent)}input[type=number]{width:110px}.switch{display:inline-flex;align-items:center;gap:8px;font-weight:700}.switch input{width:18px;height:18px}.divider{height:1px;background:var(--line);margin:16px 0}
.action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.action-card{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--surface-2)}.action-card strong{display:block;margin-bottom:4px}.action-card p{margin:0 0 12px;color:var(--muted);font-size:12px}.action-card .btn{width:100%}
.result-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.mini-stat{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface-2)}.mini-stat .k{font-size:11px;color:var(--muted);margin-bottom:4px}.mini-stat .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}.result-list{display:grid;gap:8px;margin-top:12px}.result-row{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:var(--surface-2)}.result-row .left{min-width:0}.result-row .name{font-weight:700}.result-row .sub{font-size:11px;color:var(--muted);word-break:break-word}.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}.dot.ok{background:var(--success)}.dot.bad{background:var(--danger)}.dot.warn{background:var(--warn)}
details.tech{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}details.tech summary{cursor:pointer;color:var(--muted);font-size:12px}pre{white-space:pre-wrap;word-break:break-word;background:#0b1020;color:#dbeafe;border-radius:12px;padding:13px;max-height:320px;overflow:auto;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.source-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.source-name{display:flex;align-items:center;gap:10px}.source-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--brand-soft);font-size:17px}.source-meta{font-size:12px;color:var(--muted);margin-top:2px}.rank{width:64px;color:var(--muted);font-variant-numeric:tabular-nums}.score{font-weight:800;font-variant-numeric:tabular-nums}.source-section{scroll-margin-top:94px}
.footer{padding:24px 0 38px;color:var(--muted);font-size:12px}.footer-inner{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:18px}
@media(max-width:860px){.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.split{grid-template-columns:1fr}.action-grid{grid-template-columns:1fr}.result-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hero{flex-direction:column}.hero-actions{justify-content:flex-start}}
@media(max-width:620px){.shell{width:min(100% - 22px,1120px)}.appbar-inner{height:auto;min-height:64px;align-items:flex-start;padding:10px 0;flex-direction:column;gap:9px}.nav{width:100%;overflow:auto}.nav a{flex:1;text-align:center}.brand-copy span{display:none}.page{padding-top:24px}.hero h1{font-size:25px}.stat-grid{grid-template-columns:1fr 1fr}.stat{padding:14px}.stat .value{font-size:23px}.panel-head,.panel-body{padding:14px}.table th,.table td{padding:9px 11px}.title-cell{min-width:210px}.result-grid{grid-template-columns:1fr 1fr}}
`;

const TIME_SCRIPT = `(function(){
var els=document.querySelectorAll('time[data-ts]'),now=Date.now();
for(var i=0;i<els.length;i++){
  var el=els[i],ts=Number(el.getAttribute('data-ts')); if(!ts) continue;
  var d=now-ts,rel;
  if(d<0) rel='即将'; else if(d<60000) rel='刚刚'; else if(d<3600000) rel=Math.floor(d/60000)+' 分钟前'; else if(d<86400000) rel=Math.floor(d/3600000)+' 小时前'; else rel=Math.floor(d/86400000)+' 天前';
  var t=new Date(ts),p=function(n){return n<10?'0'+n:String(n)};
  el.textContent=rel+' · '+(t.getMonth()+1)+'-'+p(t.getDate())+' '+p(t.getHours())+':'+p(t.getMinutes());
}
})();`;

function navLink(href: string, label: string, icon: string, active: boolean): string {
  return `<a href="${href}" class="${active ? 'active' : ''}">${icon} ${label}</a>`;
}

export function appShell(options: {
  title: string;
  active: ActivePage;
  body: string;
  script?: string;
}): string {
  const nav = [
    navLink('/', '总览', '⌂', options.active === 'overview'),
    navLink('/sources', '当前榜单', '▦', options.active === 'sources'),
    navLink('/admin', '控制台', '⚙', options.active === 'admin'),
  ].join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(options.title)}</title><style>${CSS}</style></head>
<body>
<header class="appbar"><div class="shell appbar-inner">
  <a class="brand" href="/"><span class="brand-mark">↗</span><span class="brand-copy"><strong>Trend Radar</strong><span>x-ranking · 热点异动监控</span></span></a>
  <nav class="nav" aria-label="主导航">${nav}</nav>
</div></header>
<main class="shell page">${options.body}</main>
<footer class="footer"><div class="shell footer-inner"><span>Trend Radar · Cloudflare Workers + D1</span><span>结构化 API / RSS 仅用于后台采集，页面只展示可读结果</span></div></footer>
<script>${TIME_SCRIPT}</script>${options.script ? `<script>${options.script}</script>` : ''}</body></html>`;
}
