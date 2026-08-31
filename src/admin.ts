export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>x-ranking 控制台</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f8fa;color:#111827;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;padding:28px 16px}main{max-width:820px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}h1{font-size:22px;margin:0}.muted{color:#6b7280}.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:180px}input,button{font:inherit;border-radius:9px;border:1px solid #d1d5db;padding:9px 11px}input[type=number]{width:110px}input[type=password]{width:100%}button{cursor:pointer;background:#fff}button.primary{background:#111827;color:#fff;border-color:#111827}button.good{background:#087f5b;color:#fff;border-color:#087f5b}button.warn{background:#c2410c;color:#fff;border-color:#c2410c}button:disabled{opacity:.5;cursor:not-allowed}.hidden{display:none}.status{font-weight:600}.ok{color:#087f5b}.bad{color:#b91c1c}pre{margin:12px 0 0;background:#0b1020;color:#dbeafe;border-radius:10px;padding:14px;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word}.switch{display:flex;align-items:center;gap:8px}.hint{font-size:12px;color:#6b7280;margin-top:8px}a{color:#2563eb;text-decoration:none}@media(prefers-color-scheme:dark){body{background:#0f172a;color:#e5e7eb}.card{background:#111827;border-color:#334155}.muted,.hint{color:#94a3b8}input,button{background:#0f172a;color:#e5e7eb;border-color:#475569}button.primary{background:#e5e7eb;color:#111827;border-color:#e5e7eb}a{color:#60a5fa}}
</style>
</head>
<body><main>
<div class="top"><div><h1>⚙️ x-ranking 控制台</h1><div class="muted">不用再手改 URL，也不用反复进 Cloudflare 调定时。</div></div><a href="/">查看状态页 →</a></div>

<section id="login" class="card">
  <h3>管理员登录</h3>
  <div class="row"><div class="grow"><input id="token" type="password" autocomplete="current-password" placeholder="输入 RUN_TOKEN（只需要登录一次）"></div><button id="loginBtn" class="primary">登录</button></div>
  <div class="hint">登录成功后使用 HttpOnly 会话 Cookie 保存 7 天；RUN_TOKEN 不会出现在 URL。</div>
</section>

<div id="panel" class="hidden">
<section class="card">
  <div class="row"><strong class="grow">手动操作</strong><span id="authState" class="status ok">已登录</span><button id="logoutBtn">退出</button></div>
  <div class="row" style="margin-top:14px">
    <button id="runBtn" class="good">▶ 立即采集</button>
    <button id="testBtn">✈ 测试 Telegram</button>
    <button id="healthBtn">🩺 健康检查</button>
  </div>
  <div class="hint">“立即采集”会真实抓取并写入 D1；“测试 Telegram”只发送测试消息。</div>
</section>

<section class="card">
  <strong>自动运行</strong>
  <div class="row" style="margin-top:14px">
    <label class="switch"><input id="enabled" type="checkbox"> 启用定时</label>
    <label>每 <input id="interval" type="number" min="1" max="1440" step="1"> 分钟运行一次</label>
    <button id="saveBtn" class="primary">保存定时</button>
  </div>
  <div id="scheduleInfo" class="hint"></div>
  <div class="hint">Cloudflare 只负责每分钟唤醒一次 Worker；是否真正采集、多久采集一次，由这里的设置决定。关闭后不会执行采集。</div>
</section>

<section class="card">
  <div class="row"><strong class="grow">结果</strong><span id="busy" class="muted"></span></div>
  <pre id="output">等待操作…</pre>
</section>
</div>
</main>
<script>
(function(){
var login=document.getElementById('login'),panel=document.getElementById('panel'),out=document.getElementById('output'),busy=document.getElementById('busy');
function showAuthed(v){login.classList.toggle('hidden',v);panel.classList.toggle('hidden',!v)}
function fmtTime(ts){return ts?new Date(ts).toLocaleString():'—'}
function print(v){out.textContent=typeof v==='string'?v:JSON.stringify(v,null,2)}
async function request(path,opt){
  busy.textContent='处理中…';
  try{
    var r=await fetch(path,Object.assign({credentials:'same-origin'},opt||{}));
    var text=await r.text(),data;try{data=JSON.parse(text)}catch(e){data=text}
    if(r.status===401){showAuthed(false);throw new Error('登录已失效，请重新输入 RUN_TOKEN')}
    if(!r.ok)throw new Error(typeof data==='string'?data:(data.error||JSON.stringify(data)));
    return data;
  }finally{busy.textContent=''}
}
async function loadSettings(){
  var s=await request('/api/settings');showAuthed(true);
  document.getElementById('enabled').checked=!!s.enabled;
  document.getElementById('interval').value=s.intervalMinutes;
  document.getElementById('scheduleInfo').textContent='上次定时执行：'+fmtTime(s.lastScheduledAt)+' · 下次预计：'+fmtTime(s.nextRunAt);
  return s;
}
document.getElementById('loginBtn').onclick=async function(){
  try{var token=document.getElementById('token').value;if(!token)return;await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})});document.getElementById('token').value='';await loadSettings();print('登录成功，可以直接点按钮操作。')}catch(e){print('登录失败：'+e.message)}
};
document.getElementById('token').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('loginBtn').click()});
document.getElementById('logoutBtn').onclick=async function(){await request('/api/logout',{method:'POST'});showAuthed(false);print('已退出')};
document.getElementById('runBtn').onclick=async function(){try{print(await request('/api/run',{method:'POST'}));await loadSettings()}catch(e){print('采集失败：'+e.message)}};
document.getElementById('testBtn').onclick=async function(){try{print(await request('/api/test',{method:'POST'}))}catch(e){print('Telegram 测试失败：'+e.message)}};
document.getElementById('healthBtn').onclick=async function(){try{print(await request('/api/health'))}catch(e){print('健康检查失败：'+e.message)}};
document.getElementById('saveBtn').onclick=async function(){try{var body={enabled:document.getElementById('enabled').checked,intervalMinutes:Number(document.getElementById('interval').value)};var s=await request('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});print({ok:true,schedule:s});await loadSettings()}catch(e){print('保存失败：'+e.message)}};
loadSettings().catch(function(){showAuthed(false)});
})();
</script></body></html>`;
}
