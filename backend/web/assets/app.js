/* ============================================================
 * 拦截件对账系统 - 商家端单页应用
 * ============================================================ */
const API = new URL('../', location.href).href; // 同源
let TOKEN = localStorage.getItem('mtoken') || '';
let USER = JSON.parse(localStorage.getItem('muser') || 'null');

/* ---------- 工具 ---------- */
async function req(url, opts = {}) {
  opts.headers = opts.headers || {};
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (opts.body && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(API + url, opts);
  const j = await r.json().catch(() => ({ code: 500, msg: '解析失败' }));
  if (j.code === 401) { logout(); }
  return j;
}
const get = (u) => req(u);
const post = (u, b) => req(u, { method: 'POST', body: b || {} });
const put = (u, b) => req(u, { method: 'PUT', body: b || {} });
const del = (u) => req(u, { method: 'DELETE' });

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
function ok(j, m) { if (j.code === 0) { toast(m || j.msg, 'success'); return true; } toast(j.msg, 'error'); return false; }
function fail(j) { toast(j.msg, 'error'); }

function fmt(s) { return s ? s.replace('T', ' ').substring(0, 19) : '-'; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function logout() {
  localStorage.removeItem('mtoken');
  localStorage.removeItem('muser');
  TOKEN = ''; USER = null;
  location.reload();
}

/* ---------- 路由 ---------- */
const routes = {
  dashboard: { title: '工作台', icon: '🏠', render: viewDashboard },
  intercept: { title: '拦截件管理', icon: '📦', render: viewIntercept },
  reconcile: { title: '对账中心', icon: '📊', render: viewReconcile },
  couriers:  { title: '快递公司', icon: '🚚', render: viewCouriers },
  accounts:  { title: '快递员密码', icon: '👤', render: viewAccounts },
  settings:  { title: '系统设置', icon: '⚙️', render: viewSettings },
};
let currentRoute = 'dashboard';

function render() {
  const app = document.getElementById('app');
  if (!TOKEN) { app.innerHTML = loginHtml(); bindLogin(); return; }
  const menu = Object.entries(routes).map(([k, v]) =>
    `<div class="menu-item ${k === currentRoute ? 'active' : ''}" data-route="${k}">
       <span class="icon">${v.icon}</span><span>${v.title}</span>
     </div>`).join('');
  app.innerHTML = `
    <div class="layout">
      <div class="sidebar">
        <div class="logo">📦 拦截件对账系统</div>
        <div style="color:#aaa;padding:8px 20px;font-size:12px;">商家管理端</div>
        ${menu}
        <div style="position:absolute;bottom:0;width:220px;padding:12px 20px;color:#aaa;font-size:12px;border-top:1px solid #003a8c;">
          ${esc(USER?.real_name || USER?.username || '')}
          <a href="javascript:logout()" style="color:#aaa;float:right;">退出</a>
        </div>
      </div>
      <div class="main">
        <div class="header"><h2>${routes[currentRoute].title}</h2><span class="muted">${new Date().toLocaleDateString('zh-CN')}</span></div>
        <div class="content" id="content"></div>
      </div>
    </div>`;
  document.querySelectorAll('.menu-item').forEach(el => {
    el.onclick = () => { currentRoute = el.dataset.route; render(); };
  });
  if (!USER?.password_mode) { currentRoute='settings'; viewSettings(document.getElementById('content')); return; }
  routes[currentRoute].render(document.getElementById('content'));
}

/* ---------- 登录 ---------- */
function loginHtml() {
  return `<div class="login-wrap"><div class="login-card">
    <h1>📦 拦截件对账系统</h1>
    <p class="sub">商家管理端</p>
    <div class="form-group"><label>密码</label><input id="lp" type="password" placeholder="请输入密码" autocomplete="current-password"></div>
    <button class="btn-primary" id="loginBtn">登 录</button>
    <p class="sub mt-16" style="font-size:12px;">请输入商家管理密码登录</p>
  </div></div>`;
}
function bindLogin() {
  const doLogin = async () => {
    const j = await post('api/auth.php?action=login', {
      password: document.getElementById('lp').value,
    });
    if (j.code === 0) {
      TOKEN = j.data.token; USER = {...j.data.user, password_mode:true};
      localStorage.setItem('mtoken', TOKEN);
      localStorage.setItem('muser', JSON.stringify(USER));
      render();
    } else { toast(j.msg, 'error'); }
  };
  document.getElementById('loginBtn').onclick = doLogin;
  document.getElementById('lp').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
}

/* ============================================================
 * 工作台
 * ============================================================ */
async function viewDashboard(c) {
  c.innerHTML = `<div class="stats-grid" id="stats"></div><div class="card"><div class="card-title">各快递公司拦截汇总（本月）</div><div id="tbl"></div></div>`;
  const j = await get('api/reconcile.php?action=overview');
  if (j.code !== 0) return fail(j);
  const list = j.data.list;
  let totalAll = 0, totalRet = 0, totalUnret = 0,totalVerified=0;
  list.forEach(r => { totalAll += r.total; totalRet += r.returned; totalUnret += r.unreturned;totalVerified+=r.verified||0; });
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="label">拦截总数（本月）</div><div class="value">${totalAll}</div></div>
    <div class="stat-card"><div class="label">已退回</div><div class="value success">${totalRet}</div></div>
    <div class="stat-card"><div class="label">已核对</div><div class="value success">${totalVerified}</div></div>
    <div class="stat-card"><div class="label">未退回</div><div class="value danger">${totalUnret}</div></div>
    <div class="stat-card"><div class="label">退回率</div><div class="value warn">${totalAll ? Math.round(totalRet/totalAll*100) : 0}%</div></div>`;
  if (!list.length) { document.getElementById('tbl').innerHTML = '<div class="empty">暂无数据</div>'; return; }
  document.getElementById('tbl').innerHTML = `
    <table><thead><tr><th>快递公司</th><th>编码</th><th class="right">拦截总数</th><th class="right">已退回</th><th class="right">已核对</th><th class="right">未退回</th><th class="right">退回率</th></tr></thead>
    <tbody>${list.map(r => `<tr>
      <td>${esc(r.courier_name)}</td><td>${esc(r.courier_code)}</td>
      <td class="right">${r.total}</td><td class="right">${r.returned}</td><td class="right">${r.verified||0}</td>
      <td class="right"><span class="${r.unreturned ? 'tag tag-danger' : ''}">${r.unreturned}</span></td>
      <td class="right">${r.total ? Math.round(r.returned/r.total*100) : 0}%</td>
    </tr>`).join('')}</tbody></table>`;
}

/* ============================================================
 * 拦截件管理
 * ============================================================ */
let interceptPage = 1;
async function viewIntercept(c) {
  c.innerHTML = `
    <div class="card">
      <div class="card-title">录入拦截件
        <button class="btn-primary btn-sm" id="btnSingle">单条录入</button>
        <button class="btn-primary btn-sm" id="btnBatch">批量录入</button>
      </div>
      <div class="muted">商家录入拦截的快递单号，快递员端将实时同步显示待退回数量。</div>
    </div>
    <div class="card">
      <div class="card-title">拦截件列表</div>
      <div class="toolbar">
        <select id="fCourier"><option value="0">全部快递公司</option></select>
        <select id="fStatus">
          <option value="">全部状态</option>
          <option value="intercepted">待退回</option>
          <option value="submitted">历史待补照片</option><option value="returned">已退回待核对</option><option value="verified">已核对</option>
          <option value="cancelled">已取消</option>
        </select>
        <input type="date" id="fFrom" value="${dateStr(-30)}">
        <input type="date" id="fTo" value="${dateStr(0)}">
        <input id="fKw" placeholder="完整运单号">
        <button class="btn-primary btn-sm" id="btnSearch">查询</button>
        <button class="btn-default btn-sm" id="btnExport">导出CSV</button>
      </div>
      <div id="list"></div>
    </div>`;
  // 加载快递公司
  const cj = await get('api/couriers.php');
  if (cj.code === 0) {
    document.getElementById('fCourier').innerHTML += cj.data.map(r => `<option value="${r.id}">${esc(r.name)} (${r.code})</option>`).join('');
  }
  document.getElementById('btnSearch').onclick = () => { interceptPage = 1; loadInterceptList(); };
  document.getElementById('btnExport').onclick = async () => {
    const p = interceptParams();
    try {
      const r = await fetch(API + 'api/reconcile.php?action=export&' + new URLSearchParams(p), {headers:{Authorization:'Bearer '+TOKEN}});
      const blob = await r.blob();
      if ((r.headers.get('Content-Type') || '').includes('json')) { toast(JSON.parse(await blob.text()).msg, 'error'); return; }
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href=url; a.download='拦截件对账.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) { toast('导出失败，请重试','error'); }
  };
  document.getElementById('btnSingle').onclick = () => showSingleModal(cj.data || []);
  document.getElementById('btnBatch').onclick = () => showBatchModal(cj.data || []);
  loadInterceptList();
}
function dateStr(off) { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); }
function interceptParams() {
  return {
    courier_id: document.getElementById('fCourier').value,
    status: document.getElementById('fStatus').value,
    date_from: document.getElementById('fFrom').value,
    date_to: document.getElementById('fTo').value,
    keyword: document.getElementById('fKw').value.trim(),
    page: interceptPage, size: 50,
  };
}
async function loadInterceptList() {
  const p = interceptParams();
  const qs = new URLSearchParams(p).toString();
  const el = document.getElementById('list');
  el.innerHTML = '<div class="empty">加载中...</div>';
  const j = await get('api/intercepts.php?action=list&' + qs);
  if (j.code !== 0) return fail(j);
  const d = j.data;
  if (!d.list.length) { el.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  const statusTag = { intercepted: '<span class="tag tag-warn">待退回</span>', returned: '<span class="tag tag-warn">已退回待核对</span>', verified: '<span class="tag tag-ok">已核对</span>', submitted: '<span class="tag tag-warn">历史待补照片</span>', cancelled: '<span class="tag tag-info">已取消</span>' };
  const methodMap = { manual: '手动', photo: '拍照', scan: '扫描', '': '-' };
  el.innerHTML = `
    <table><thead><tr>
      <th>运单号</th><th>快递公司</th><th>状态</th>
      <th>拦截时间</th><th>退回时间</th><th>退回方式</th><th>退回人</th><th>备注</th><th>操作</th>
    </tr></thead><tbody>
    ${d.list.map(r => `<tr>
      <td>${esc(r.tracking_no)}</td>
      <td>${esc(r.courier_name)}</td><td>${statusTag[r.status]}</td>
      <td>${fmt(r.intercepted_at)}</td><td>${r.returned_at ? fmt(r.returned_at) : '-'}</td>
      <td>${methodMap[r.return_method] || '-'}</td><td>${esc(r.returned_name) || '-'}</td>
      <td>${esc(r.note)}</td>
      <td><button class="btn-default btn-sm" onclick="reviewReturn(${r.id})">查看照片 / 核对</button>${r.status === 'intercepted' ? `<button class="btn-default btn-sm" onclick="cancelIntercept(${r.id})">取消</button>` : ''}</td>
    </tr>`).join('')}
    </tbody></table>
    <div class="pagination">
      <span class="info">共 ${d.total} 条，第 ${d.page} 页</span>
      <button class="btn-default btn-sm" ${d.page <= 1 ? 'disabled' : ''} onclick="interceptPage--;loadInterceptList()">上一页</button>
      <button class="btn-default btn-sm" ${d.page * d.size >= d.total ? 'disabled' : ''} onclick="interceptPage++;loadInterceptList()">下一页</button>
    </div>`;
}
async function cancelIntercept(id) {
  if (!confirm('确认取消该拦截件？')) return;
  const j = await post('api/intercepts.php?action=cancel', { id });
  if (ok(j)) loadInterceptList();
}
function showSingleModal(couriers) {
  modal(`
    <h3>单条录入拦截件</h3><p class="muted">直接输入单号，按后台维护的单号前缀自动匹配快递公司。未匹配到时不会录入。</p>
    <div class="form-group"><label>运单号 *</label><input id="mTracking" placeholder="请输入完整运单号"></div>
    <div class="form-group"><label>备注</label><input id="mNote" placeholder="可选"></div>
    <div class="actions"><button class="btn-default" onclick="closeModal()">取消</button><button class="btn-primary" id="mSave">保存</button></div>
  `);
  document.getElementById('mSave').onclick = async () => {
    const j = await post('api/intercepts.php?action=import', {
      tracking_no: document.getElementById('mTracking').value.trim().toUpperCase(),
      note: document.getElementById('mNote').value.trim(),
    });
    if (ok(j)) { closeModal(); loadInterceptList(); }
  };
}
function showBatchModal(couriers) {
  modal(`
    <h3>批量录入拦截件</h3><p class="muted">可混合录入不同公司单号，每批最多1000条；按单号前缀自动匹配，失败项单独列出。</p>
    <div class="form-group"><label>运单号列表（每行一个，或用逗号/空格分隔）</label>
      <textarea id="bList" rows="10" placeholder="SF1234567890&#10;SF1234567891&#10;..."></textarea></div>
    <div class="actions"><button class="btn-default" onclick="closeModal()">取消</button><button class="btn-primary" id="bSave">批量录入</button></div>
  `);
  document.getElementById('bSave').onclick = async () => {
    const button=document.getElementById('bSave'); button.disabled=true; button.textContent='正在识别，请稍候…';
    try {
    const j = await post('api/intercepts.php?action=batch', {
      tracking_list: document.getElementById('bList').value,
    });
    if (ok(j)) {
      closeModal(); loadInterceptList();
      if(j.data.errors.length) modal('<h3>部分单号未录入</h3><p>成功 '+j.data.success+' 条，重复 '+j.data.duplicate+' 条，失败 '+j.data.errors.length+' 条</p><pre style="white-space:pre-wrap">'+j.data.errors.map(esc).join('\n')+'</pre><button class="btn-default" onclick="closeModal()">关闭</button>');
    }
    } finally { if(button.isConnected){button.disabled=false;button.textContent='批量录入';} }
  };
}

/* ============================================================
 * 对账中心
 * ============================================================ */
async function viewReconcile(c) {
  c.innerHTML = `
    <div class="card">
      <div class="card-title">对账查询</div>
      <div class="toolbar">
        <select id="rCourier"><option value="0">全部快递公司</option></select>
        <input type="date" id="rFrom" value="${dateStr(-30)}">
        <input type="date" id="rTo" value="${dateStr(0)}">
        <button class="btn-primary btn-sm" id="rSearch">查询</button>
        <button class="btn-success btn-sm" id="rSave">保存对账记录</button>
      </div>
      <div id="rOverview"></div>
    </div>
    <div class="card"><div class="card-title">明细对账</div><div id="rDetail"></div></div>
    <div class="card"><div class="card-title">历史对账记录</div><div id="rLogs"></div></div>`;
  const cj = await get('api/couriers.php');
  if (cj.code === 0) {
    document.getElementById('rCourier').innerHTML += cj.data.map(r => `<option value="${r.id}">${esc(r.name)} (${r.code})</option>`).join('');
  }
  document.getElementById('rSearch').onclick = loadReconcile;
  document.getElementById('rSave').onclick = saveReconcile;
  loadReconcile();
  loadReconcileLogs();
}
async function loadReconcile() {
  const courier_id = document.getElementById('rCourier').value;
  const date_from = document.getElementById('rFrom').value;
  const date_to = document.getElementById('rTo').value;
  const oj = await get(`api/reconcile.php?action=overview&date_from=${date_from}&date_to=${date_to}`);
  if (oj.code === 0) {
    const list = oj.data.list;
    document.getElementById('rOverview').innerHTML = `
      <table><thead><tr><th>快递公司</th><th class="right">拦截总数</th><th class="right">已退回</th><th class="right">已核对</th><th class="right">未退回</th><th class="right">退回率</th></tr></thead>
      <tbody>${list.map(r => `<tr><td>${esc(r.courier_name)} (${esc(r.courier_code)})</td><td class="right">${r.total}</td><td class="right">${r.returned}</td><td class="right">${r.verified||0}</td><td class="right"><span class="${r.unreturned?'tag tag-danger':''}">${r.unreturned}</span></td><td class="right">${r.total?Math.round(r.returned/r.total*100):0}%</td></tr>`).join('')}</tbody></table>`;
  }
  if (courier_id > 0) {
    const dj = await get(`api/reconcile.php?action=detail&courier_id=${courier_id}&date_from=${date_from}&date_to=${date_to}`);
    if (dj.code === 0) {
      const d = dj.data;
      const statusTag = { intercepted: '<span class="tag tag-warn">待退回</span>', returned: '<span class="tag tag-warn">已退回待核对</span>', verified: '<span class="tag tag-ok">已核对</span>', submitted: '<span class="tag tag-warn">历史待补照片</span>', cancelled: '<span class="tag tag-info">已取消</span>' };
      document.getElementById('rDetail').innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="label">拦截总数</div><div class="value">${d.summary.total}</div></div>
          <div class="stat-card"><div class="label">已退回</div><div class="value success">${d.summary.returned}</div></div>
          <div class="stat-card"><div class="label">已核对</div><div class="value success">${d.summary.verified||0}</div></div><div class="stat-card"><div class="label">未退回</div><div class="value danger">${d.summary.unreturned}</div></div>
        </div>
        <table><thead><tr><th>运单号</th><th>状态</th><th>拦截时间</th><th>退回时间</th><th>退回人</th><th>备注</th></tr></thead>
        <tbody>${d.list.map(r => `<tr><td>${esc(r.tracking_no)}</td><td>${statusTag[r.status]}</td><td>${fmt(r.intercepted_at)}</td><td>${r.returned_at?fmt(r.returned_at):'-'}</td><td>${esc(r.returned_name)||'-'}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>`;
    }
  } else {
    document.getElementById('rDetail').innerHTML = '<div class="empty">请选择具体快递公司查看明细</div>';
  }
}
async function saveReconcile() {
  const courier_id = +document.getElementById('rCourier').value;
  if (courier_id <= 0) { toast('请选择快递公司', 'error'); return; }
  const note = prompt('请输入对账备注（可选）', '');
  if (note === null) return;
  const j = await post('api/reconcile.php?action=save', {
    courier_id,
    date_from: document.getElementById('rFrom').value,
    date_to: document.getElementById('rTo').value,
    note,
  });
  if (ok(j)) loadReconcileLogs();
}
async function loadReconcileLogs() {
  const j = await get('api/reconcile.php?action=logs');
  if (j.code !== 0) return;
  const el = document.getElementById('rLogs');
  if (!j.data.length) { el.innerHTML = '<div class="empty">暂无对账记录</div>'; return; }
  el.innerHTML = `<table><thead><tr><th>快递公司</th><th>对账周期</th><th class="right">总数</th><th class="right">已退回</th><th class="right">已核对</th><th class="right">未退回</th><th>操作人</th><th>备注</th><th>时间</th></tr></thead>
    <tbody>${j.data.map(r => `<tr><td>${esc(r.courier_name)}</td><td>${r.period_start} ~ ${r.period_end}</td><td class="right">${r.total}</td><td class="right">${r.returned}</td><td class="right">${r.verified||0}</td><td class="right">${r.unreturned}</td><td>${esc(r.merchant_name)}</td><td>${esc(r.note)}</td><td>${fmt(r.created_at)}</td></tr>`).join('')}</tbody></table>`;
}

/* ============================================================
 * 快递公司管理
 * ============================================================ */
async function viewCouriers(c) {
  c.innerHTML = `<div class="card"><div class="card-title">快递公司管理<button class="btn-primary btn-sm" id="addBtn">+ 新增</button></div><div id="tbl">加载中...</div></div>`;
  document.getElementById('addBtn').onclick = () => showCourierModal();
  loadCouriers();
}
async function loadCouriers() {
  const j = await get('api/couriers.php');
  if (j.code !== 0) return fail(j);
  const el = document.getElementById('tbl');
  if (!j.data.length) { el.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  el.innerHTML = `<table><thead><tr><th>ID</th><th>名称</th><th>编码</th><th>单号前缀</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
    <tbody>${j.data.map(r => `<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${esc(r.code)}</td><td>${esc(r.prefixes)||'未设置'}</td><td>${r.status ? '<span class="tag tag-ok">启用</span>' : '<span class="tag tag-danger">禁用</span>'}</td><td>${fmt(r.created_at)}</td>
      <td><button class="btn-default btn-sm" onclick='showCourierModal(${esc(JSON.stringify(r)).replace(/'/g, "&#39;")})'>编辑</button></td></tr>`).join('')}</tbody></table>`;
}
function showCourierModal(r) {
  r = r || { id: 0, name: '', code: '', logo: '', status: 1 };
  modal(`<h3>${r.id ? '编辑' : '新增'}快递公司</h3>
    <div class="form-group"><label>名称 *</label><input id="cName" value="${esc(r.name)}"></div>
    <div class="form-group"><label>编码 *</label><input id="cCode" value="${esc(r.code)}" placeholder="如 SF / ZTO"></div>
    <div class="form-group"><label>单号前缀（多个用逗号、空格或换行分隔）</label><textarea id="cPrefixes" rows="3" placeholder="填写该公司实际使用的单号前几位">${esc(r.prefixes||'')}</textarea><p class="muted">优先匹配更长前缀。同一前缀不能分给两家公司。</p></div>
    <div class="form-group"><label>Logo URL</label><input id="cLogo" value="${esc(r.logo)}"></div>
    <div class="form-group"><label>状态</label><select id="cStatus"><option value="1" ${r.status?'selected':''}>启用</option><option value="0" ${!r.status?'selected':''}>禁用</option></select></div>
    <div class="actions"><button class="btn-default" onclick="closeModal()">取消</button><button class="btn-primary" id="cSave">保存</button></div>`);
  document.getElementById('cSave').onclick = async () => {
    const body = { prefixes: document.getElementById('cPrefixes').value, name: document.getElementById('cName').value.trim(), code: document.getElementById('cCode').value.trim(), logo: document.getElementById('cLogo').value.trim(), status: +document.getElementById('cStatus').value };
    const j = r.id ? await put('api/couriers.php?id=' + r.id, body) : await post('api/couriers.php', body);
    if (ok(j)) { closeModal(); loadCouriers(); }
  };
}

/* ============================================================
 * 快递员密码管理
 * ============================================================ */
async function viewAccounts(c) {
 c.innerHTML='<div class="card"><div class="card-title">快递员密码</div><p>每家快递公司一个密码，直接下发给该公司的快递员。修改后旧登录失效。</p><div id="tbl">加载中...</div></div>';
 await loadAccounts();
}
async function loadAccounts() {
 const j=await get('api/accounts.php'); if(j.code!==0) return fail(j);
 const el=document.getElementById('tbl'); if(!el) return;
 el.innerHTML='<table><thead><tr><th>快递公司</th><th>编码</th><th>启用状态</th><th>密码状态</th><th>操作</th></tr></thead><tbody>'+j.data.map(r=>`<tr><td>${esc(r.courier_name)}</td><td>${esc(r.courier_code)}</td><td>${+r.status?'启用':'停用'}</td><td>${+r.password_set?'已设置':'未设置'}</td><td><button class="btn-primary btn-sm" onclick="setCourierPassword(${r.courier_id})">设置密码</button></td></tr>`).join('')+'</tbody></table>';
}
function setCourierPassword(cid) {
 modal('<h3>设置该快递公司的密码</h3><div class="form-group"><label>新密码（至少8位）</label><input id="companyPwd" type="password" autocomplete="new-password"></div><div class="form-group"><label>确认密码</label><input id="companyPwd2" type="password" autocomplete="new-password"></div><div class="actions"><button class="btn-default" onclick="closeModal()">取消</button><button class="btn-primary" id="companySave">保存</button></div>');
 document.getElementById('companySave').onclick=async()=>{
  const password=document.getElementById('companyPwd').value;
  if(password!==document.getElementById('companyPwd2').value) return toast('两次密码不一致','error');
  if(password.length<8) return toast('密码至少8位','error');
  const j=await put('api/accounts.php',{courier_id:cid,password}); if(ok(j)){closeModal();loadAccounts();}
 };
}

/* ============================================================
 * 系统设置
 * ============================================================ */
async function viewSettings(c) {
 c.innerHTML='<div class="card"><div class="card-title">商家密码</div><p>首次设置时原密码留空。保存后请使用新密码重新登录。</p><div class="form-group"><label>原密码</label><input id="oldPwd" type="password" autocomplete="current-password"></div><div class="form-group"><label>新密码（至少8位）</label><input id="newPwd" type="password" autocomplete="new-password"></div><div class="form-group"><label>确认密码</label><input id="newPwd2" type="password" autocomplete="new-password"></div><button class="btn-primary" id="saveMerchantPwd">保存密码</button></div>';
 document.getElementById('saveMerchantPwd').onclick=async()=>{
  const password=document.getElementById('newPwd').value;
  if(password!==document.getElementById('newPwd2').value) return toast('两次密码不一致','error');
  if(password.length<8) return toast('密码至少8位','error');
  const j=await post('api/auth.php?action=set_password',{password,old_password:document.getElementById('oldPwd').value}); if(ok(j)) logout();
 };
}

/* ---------- 模态框 ---------- */
function modal(html) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.id = 'modalMask';
  mask.innerHTML = `<div class="modal" onclick="event.stopPropagation()">${html}</div>`;
  mask.onclick = closeModal;
  document.body.appendChild(mask);
}
function closeModal() { if(typeof releaseReviewPhotos==='function') releaseReviewPhotos(); const m = document.getElementById('modalMask'); if (m) m.remove(); }

/* ---------- 启动 ---------- */
render();

