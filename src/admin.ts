import { appShell } from './ui';

export function renderAdminPage(): string {
  const body = `<section class="hero">
<div class="hero-copy"><div class="eyebrow">Control Center</div><h1>所有操作都在这里点，不再手改 URL。</h1><p>登录一次后可以直接采集、测试 Telegram、健康检查、暂停或调整自动运行频率。技术细节默认收起，需要时再展开。</p></div>
<div class="hero-actions"><a class="btn" href="/">总览</a><a class="btn" href="/sources">▦ 当前榜单</a></div>
</section>

<section id="loginCard" class="panel">
<div class="panel-head"><div class="panel-title">🔐 管理员登录</div><span class="status-pill idle">需要 RUN_TOKEN</span></div>
<div class="panel-body">
  <div class="field"><label for="token">RUN_TOKEN</label><input id="token" type="password" autocomplete="current-password" placeholder="输入你在 Cloudflare 中配置的 RUN_TOKEN"></div>
  <div class="form-row" style="margin-top:12px"><button id="loginBtn" class="btn primary">登录控制台</button><span class="muted" style="font-size:12px">登录成功后使用 HttpOnly Cookie 保持 7 天，Token 不会出现在网址里。</span></div>
  <div id="loginError" class="notice warn" style="display:none;margin-top:12px"></div>
</div>
</section>

<div id="panel" style="display:none">
<section id="actions" class="panel">
<div class="panel-head"><div class="panel-title">快捷操作 <span class="hint muted">最常用的三件事</span></div><div class="form-row"><span id="authState" class="status-pill ok">已登录</span><button id="logoutBtn" class="btn small">退出</button></div></div>
<div class="panel-body"><div class="action-grid">
  <div class="action-card"><strong>立即采集</strong><p>马上抓取所有数据源、写入 D1，并执行异动判断。</p><button id="runBtn" class="btn success action-btn">▶ 立即采集</button></div>
  <div class="action-card"><strong>健康检查</strong><p>检查 D1、Secrets 以及各数据源是否能正常访问。</p><button id="healthBtn" class="btn action-btn">🩺 开始检查</button></div>
  <div class="action-card"><strong>Telegram 测试</strong><p>只发送一条测试消息，不执行采集，也不会产生告警。</p><button id="testBtn" class="btn action-btn">✈ 发送测试消息</button></div>
</div></div>
</section>

<section id="schedule" class="panel">
<div class="panel-head"><div class="panel-title">自动运行 <span class="hint muted">以后直接在页面改</span></div><span id="scheduleBadge" class="status-pill idle">读取中</span></div>
<div class="panel-body">
  <div class="form-row" style="justify-content:space-between;align-items:flex-start">
    <div class="field"><label>运行状态</label><label class="switch"><input id="enabled" type="checkbox"> 启用自动采集</label></div>
    <div class="field"><label for="interval">自定义间隔</label><div class="form-row"><input id="interval" type="number" min="1" max="1440" step="1"><span class="muted">分钟</span><button id="saveBtn" class="btn primary">保存设置</button></div></div>
  </div>
  <div class="divider"></div>
  <div class="field"><label>常用频率 · 一键选择</label><div class="chips" id="presetBox">
    <button class="chip" data-min="5">5 分钟</button><button class="chip" data-min="10">10 分钟</button><button class="chip" data-min="20">20 分钟</button><button class="chip" data-min="30">30 分钟</button><button class="chip" data-min="60">1 小时</button><button class="chip" data-min="120">2 小时</button>
  </div></div>
  <div id="scheduleInfo" class="notice" style="margin-top:14px">正在读取定时设置…</div>
</div>
<div class="panel-foot">Cloudflare 的基础 Cron 只负责每分钟唤醒一次 Worker；真正是否执行、多久执行一次，由这里的 D1 设置决定。</div>
</section>

<section class="panel" id="resultPanel">
<div class="panel-head"><div class="panel-title">操作结果</div><span id="busy" class="status-pill idle">等待操作</span></div>
<div class="panel-body"><div id="resultBox"><div class="empty"><div class="empty-icon">✨</div><strong>准备好了</strong><div>点上面的按钮即可。结果会自动整理成可读卡片。</div></div></div></div>
</section>
</div>`;

  const script = `(function(){
var $=function(id){return document.getElementById(id)}, loginCard=$('loginCard'), panel=$('panel'), result=$('resultBox'), busy=$('busy');
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function showAuthed(v){loginCard.style.display=v?'none':'';panel.style.display=v?'':'none'}
function setBusy(v,label){busy.className='status-pill '+(v?'warn':'idle');busy.textContent=v?(label||'处理中'):'等待操作';var bs=document.querySelectorAll('.action-btn,#saveBtn');for(var i=0;i<bs.length;i++)bs[i].disabled=v}
function fmtTime(ts){return ts?new Date(ts).toLocaleString():'—'}
async function request(path,opt){
  setBusy(true,'处理中');
  try{
    var r=await fetch(path,Object.assign({credentials:'same-origin'},opt||{}));
    var text=await r.text(),data;try{data=JSON.parse(text)}catch(e){data=text}
    if(r.status===401){showAuthed(false);throw new Error('登录已失效，请重新输入 RUN_TOKEN')}
    if(!r.ok)throw new Error(typeof data==='string'?data:(data.error||JSON.stringify(data)));
    return data;
  }finally{setBusy(false)}
}
function stat(k,v,meta){return '<div class="mini-stat"><div class="k">'+esc(k)+'</div><div class="v">'+esc(v)+'</div>'+(meta?'<div class="muted" style="font-size:11px;margin-top:3px">'+esc(meta)+'</div>':'')+'</div>'}
function details(data){return '<details class="tech"><summary>技术详情 / 原始 JSON</summary><pre>'+esc(JSON.stringify(data,null,2))+'</pre></details>'}
function row(name,ok,sub,right){return '<div class="result-row"><div class="left"><div class="name"><span class="dot '+(ok?'ok':'bad')+'"></span>'+esc(name)+'</div>'+(sub?'<div class="sub">'+esc(sub)+'</div>':'')+'</div><div class="strong">'+esc(right==null?'':right)+'</div></div>'}
function renderRun(d){
  var h='<div class="notice '+(d.errors&&d.errors.length?'warn':'')+'">'+(d.errors&&d.errors.length?'采集完成，但有部分数据源异常。':'采集完成，数据已写入 D1。')+'</div>';
  h+='<div class="result-grid" style="margin-top:12px">'+stat('本轮采集',d.polled||0)+stat('写入快照',d.inserted||0)+stat('检测异动',d.alerts||0)+stat('Telegram 推送',d.notified||0)+'</div>';
  if(d.sources&&d.sources.length){h+='<div class="result-list">';for(var i=0;i<d.sources.length;i++){var s=d.sources[i];h+=row(s.source,!s.error,s.error||'采集正常',s.count||0)}h+='</div>'}
  if(d.errors&&d.errors.length)h+='<div class="notice warn" style="margin-top:12px">'+esc(d.errors.join(' · '))+'</div>';
  h+='<div class="form-row" style="margin-top:14px"><a class="btn primary" href="/sources">查看最新榜单</a><a class="btn" href="/">返回总览</a></div>'+details(d);result.innerHTML=h;
}
function renderHealth(d){
  var db=d.db||{}, secrets=d.secrets||{};
  var h='<div class="notice '+(d.ok?'':'warn')+'">'+(d.ok?'基础运行环境正常。':'发现配置或数据源问题，请看下面的红色项目。')+'</div>';
  h+='<div class="result-grid" style="margin-top:12px">'+stat('D1 Items',db.items||0)+stat('Snapshots',db.snapshots||0)+stat('Alerts',db.alerts||0)+stat('Runs',db.runs||0)+'</div><div class="result-list">';
  h+=row('D1 数据库',!!db.ok,db.error||'四张核心表可读写',db.ok?'正常':'异常');
  h+=row('RUN_TOKEN',!!secrets.runToken,'管理员登录与 API 鉴权',secrets.runToken?'已配置':'缺失');
  h+=row('Telegram Bot',!!secrets.telegramBotToken,'推送机器人 Token',secrets.telegramBotToken?'已配置':'缺失');
  h+=row('Telegram Chat ID',!!secrets.telegramChatId,'推送目标会话',secrets.telegramChatId?'已配置':'缺失');
  if(d.sources)for(var i=0;i<d.sources.length;i++){var s=d.sources[i];h+=row('数据源 · '+s.source,!s.error,s.error||'网络与解析正常',(s.count||0)+' 条')}
  h+='</div>';
  if(d.fetchErrors&&d.fetchErrors.length)h+='<div class="notice warn" style="margin-top:12px">'+esc(d.fetchErrors.join(' · '))+'</div>';
  h+=details(d);result.innerHTML=h;
}
function renderTest(d){result.innerHTML='<div class="notice '+(d.ok?'':'warn')+'">'+esc(d.detail|| (d.ok?'Telegram 测试成功':'Telegram 测试失败'))+'</div>'+details(d)}
function markPreset(n){var bs=document.querySelectorAll('#presetBox [data-min]');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('active',Number(bs[i].getAttribute('data-min'))===Number(n))}
function renderSchedule(s){
  $('enabled').checked=!!s.enabled;$('interval').value=s.intervalMinutes;markPreset(s.intervalMinutes);
  $('scheduleBadge').className='status-pill '+(s.enabled?'ok':'idle');$('scheduleBadge').textContent=s.enabled?'自动运行中':'已暂停';
  $('scheduleInfo').innerHTML=s.enabled?'当前每 <b>'+esc(s.intervalMinutes)+'</b> 分钟运行一次 · 上次定时执行：'+esc(fmtTime(s.lastScheduledAt))+' · 下次预计：'+esc(fmtTime(s.nextRunAt)):'自动运行已暂停；手动「立即采集」仍然可用。';
}
async function loadSettings(){var s=await request('/api/settings');showAuthed(true);renderSchedule(s);return s}
$('loginBtn').onclick=async function(){
  $('loginError').style.display='none';try{var token=$('token').value.trim();if(!token)throw new Error('请输入 RUN_TOKEN');await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})});$('token').value='';await loadSettings();result.innerHTML='<div class="notice">登录成功。现在所有操作都可以直接点击。</div>'}catch(e){$('loginError').textContent='登录失败：'+e.message;$('loginError').style.display='block'}
};
$('token').addEventListener('keydown',function(e){if(e.key==='Enter')$('loginBtn').click()});
$('logoutBtn').onclick=async function(){try{await request('/api/logout',{method:'POST'})}catch(e){}showAuthed(false)};
$('runBtn').onclick=async function(){try{renderRun(await request('/api/run',{method:'POST'}));await loadSettings()}catch(e){result.innerHTML='<div class="notice warn">采集失败：'+esc(e.message)+'</div>'}};
$('healthBtn').onclick=async function(){try{renderHealth(await request('/api/health'))}catch(e){result.innerHTML='<div class="notice warn">健康检查失败：'+esc(e.message)+'</div>'}};
$('testBtn').onclick=async function(){try{renderTest(await request('/api/test',{method:'POST'}))}catch(e){result.innerHTML='<div class="notice warn">Telegram 测试失败：'+esc(e.message)+'</div>'}};
$('saveBtn').onclick=async function(){try{var body={enabled:$('enabled').checked,intervalMinutes:Number($('interval').value)};var s=await request('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});renderSchedule(s);result.innerHTML='<div class="notice">定时设置已保存：'+(s.enabled?'每 '+esc(s.intervalMinutes)+' 分钟运行一次':'已暂停自动运行')+'。</div>'+details(s)}catch(e){result.innerHTML='<div class="notice warn">保存失败：'+esc(e.message)+'</div>'}};
var presets=document.querySelectorAll('#presetBox [data-min]');for(var i=0;i<presets.length;i++)presets[i].onclick=function(){$('interval').value=this.getAttribute('data-min');markPreset(this.getAttribute('data-min'))};
$('interval').addEventListener('input',function(){markPreset(this.value)});
loadSettings().catch(function(){showAuthed(false)});
})();`;

  return appShell({ title: 'Trend Radar · 控制台', active: 'admin', body, script });
}
