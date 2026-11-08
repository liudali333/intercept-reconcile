/* ============================================================
 * 拦截件对账系统 - 快递员端
 * 扫描条码自动拍照 / 批量上传照片自动匹配
 * ============================================================ */

// ===== 配置：后端 API 基址 =====
// 部署时改为后端实际地址，如 'http://your-server/intercept/backend/'
const API_BASE = (function () {
  // 默认同源部署在 backend/ 下；可由 localStorage 覆盖
  const saved = localStorage.getItem('api_base');
  if (saved) return saved;
  // 推断：frontend 与 backend 同级目录
  const p = location.pathname.replace(/frontend\/.*$/i, 'backend/');
  return location.origin + p;
})();

let TOKEN = localStorage.getItem('ctoken') || '';
let USER = JSON.parse(localStorage.getItem('cuser') || 'null');
let currentTab = 'scan'; // scan | list

/* ---------- 工具 ---------- */
async function req(url, opts = {}) {
  opts.headers = opts.headers || {};
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (opts.body && typeof opts.body === 'object' && !(typeof FormData!=='undefined' && opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  try {
    const r = await fetch(API_BASE + url, opts);
    const j = await r.json().catch(() => ({ code: 500, msg: '服务器响应异常' }));
    if (j.code === 401) logout();
    return j;
  } catch (e) {
    return { code: -1, msg: '网络错误：' + e.message };
  }
}
const get = (u) => req(u);
const post = (u, b) => req(u, { method: 'POST', body: b || {} });

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmt(s) { return s ? s.replace('T', ' ').substring(5, 16) : '-'; }

function logout() {
  localStorage.removeItem('ctoken');
  localStorage.removeItem('cuser');
  TOKEN = ''; USER = null;
  location.reload();
}

/* ---------- 渲染入口 ---------- */
function render() {
  const app = document.getElementById('app');
  if (!TOKEN) { app.innerHTML = loginHtml(); bindLogin(); return; }
  app.innerHTML = `
    <div class="app">
      <div class="header">
        <div class="row1">
          <div>
            <div class="courier">${esc(USER.courier_name)} <span style="opacity:.7;font-size:12px;">${esc(USER.courier_code)}</span></div>
            <div class="user">${esc(USER.real_name)} · 拦截件退回</div>
          </div>
          <div class="logout" onclick="logout()">退出</div>
        </div>
      </div>
      <div class="stats" id="stats"><div class="loading">加载中</div></div>
      <div class="tabs">
        <div class="tab ${currentTab==='scan'?'active':''}" onclick="switchTab('scan')">📝 录入退回</div>
        <div class="tab ${currentTab==='list'?'active':''}" onclick="switchTab('list')">📋 待退回列表</div>
      </div>
      <div class="content" id="content"></div>
    </div>`;
  loadStats();
  renderTab();
}
function switchTab(t) { stopScan();currentTab = t; render(); }

/* ---------- 登录 ---------- */
function loginHtml() {
  return `<div class="login"><div class="login-card">
    <h1>📦 拦截件退回</h1>
    <p class="sub">快递员端</p>
    <div class="fg"><label>快递公司</label><select id="lc"><option value="0">请选择...</option></select></div>
    <div class="fg"><label>密码</label><input id="lp" type="password" placeholder="请输入密码" autocomplete="current-password"></div>
    <button class="btn-primary" id="loginBtn">登 录</button>
    <p class="sub" style="margin-top:16px;font-size:11px;">每家快递公司一个密码，数据互不共享</p>
    <details style="margin-top:12px;"><summary style="font-size:12px;color:#999;">设置后端地址</summary>
      <input id="apiBase" style="margin-top:8px;font-size:12px;" placeholder="${esc(API_BASE)}">
      <button class="btn-default" style="margin-top:6px;padding:6px;" onclick="saveApiBase()">保存</button>
    </details>
  </div></div>`;
}
function saveApiBase() {
  const v = document.getElementById('apiBase').value.trim();
  if (v) { localStorage.setItem('api_base', v); toast('已保存，刷新生效', 'success'); setTimeout(() => location.reload(), 800); }
}
async function bindLogin() {
  // 加载快递公司
  const j = await get('api/accounts.php?action=courier_companies');
  if (j.code === 0) {
    document.getElementById('lc').innerHTML += j.data.map(r => `<option value="${r.id}">${esc(r.name)} (${r.code})</option>`).join('');
  } else {
    toast('无法连接后端：' + j.msg, 'error');
  }
  const doLogin = async () => {
    const j = await post('api/accounts.php?action=courier_login', {
      courier_id: +document.getElementById('lc').value,
      password: document.getElementById('lp').value,
    });
    if (j.code === 0) {
      TOKEN = j.data.token; USER = j.data.user;
      localStorage.setItem('ctoken', TOKEN);
      localStorage.setItem('cuser', JSON.stringify(USER));
      render();
    } else toast(j.msg, 'error');
  };
  document.getElementById('loginBtn').onclick = doLogin;
  document.getElementById('lp').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
}

/* ---------- 统计 ---------- */
async function loadStats() {
  const j = await get('api/intercepts.php?action=courier_stats');
  if (j.code !== 0 || !document.getElementById('stats')) return;
  const d = j.data;
  document.getElementById('stats').innerHTML = `
    <div class="stat-grid">
      <div class="stat-box big"><span class="si">📦</span><div class="v ${d.unreturned > 0 ? 'danger' : 'success'}">${d.unreturned}</div><div class="l">待交回包裹</div></div>
      <div class="stat-box"><span class="si">🆕</span><div class="v">${d.total_today}</div><div class="l">今日新增拦截</div></div>
      <div class="stat-box"><span class="si">↩️</span><div class="v success">${d.returned_today}</div><div class="l">今日已退回</div></div>
      <div class="stat-box"><span class="si">⏳</span><div class="v">${d.awaiting_review||0}</div><div class="l">已退回待核对</div></div>
      <div class="stat-box"><span class="si">✅</span><div class="v success">${d.verified||0}</div><div class="l">已核对</div></div>
    </div>`;
}

/* ---------- Tab 渲染 ---------- */
function renderTab() {
  const c = document.getElementById('content');
  if (currentTab === 'scan') renderScan(c);
  else renderList(c);
}

/* ============================================================
 * 录入退回
 * ============================================================ */
function renderScan(c) {
 c.innerHTML='<div class="card"><div class="card-title">扫码拍照退回</div><p>扫描完整运单条码，识别成功后自动拍照、匹配并上传。请让包裹和清晰单号留在画面内。</p><button class="btn-primary" onclick="startScan()">开始扫码并自动拍照</button><p id="scanStatus"></p></div><div class="card"><button class="btn-primary" onclick="startBatchPhotos()">上传照片自动匹配（支持批量）</button><p>每张照片对应一个包裹，识别到唯一完整单号后自动上传登记退回；失败请重新拍摄。</p><div id="batchPhotoArea"></div></div>';
 renderPhotoBatch();
}
let quaggaRunning=false,scanCapturing=false,scanLastCode='',scanHits=0;
async function startScan() {
 if(quaggaRunning||scanCapturing||batchRecognizing)return toast('正在处理，请稍候','error');
 if(!window.isSecureContext)return toast('扫码摄像头需要HTTPS，请使用HTTPS地址打开','error');
 if(typeof Quagga==='undefined')return toast('扫描库未加载，请刷新后重试','error');
 const wrap=document.createElement('div');wrap.className='camera-wrap';wrap.id='cameraWrap';
 wrap.innerHTML='<div class="camera-bar"><button onclick="stopScan()">关闭</button><span>扫码后自动拍照并上传</span></div><div id="quaggaViewport" style="position:relative;flex:1"></div><div class="scan-tip">请让条码、单号和包裹留在画面内</div>';document.body.appendChild(wrap);
 scanLastCode='';scanHits=0;
 Quagga.init({inputStream:{name:'Live',type:'LiveStream',target:document.getElementById('quaggaViewport'),constraints:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}},decoder:{readers:['code_128_reader','code_39_reader','codabar_reader','ean_reader','ean_8_reader','upc_reader','upc_e_reader','i2of5_reader'],multiple:false},locate:true,frequency:10},err=>{
  if(err){stopScan();toast('摄像头启动失败，请检查权限','error');return;}
  if(!document.getElementById('cameraWrap')){try{Quagga.stop();}catch(e){}return;}
  Quagga.offDetected();Quagga.onDetected(captureDetectedParcel);Quagga.start();quaggaRunning=true;
 });
}
async function captureDetectedParcel(result) {
 if(scanCapturing)return;
 const code=(result?.codeResult?.code||'').trim().toUpperCase();
 if(!/^[A-Z0-9]{6,50}$/.test(code))return;
 const tip=document.querySelector('.scan-tip');
 if(tip){const n=code===scanLastCode?scanHits+1:1;tip.textContent='识别到：'+code+'（'+n+'/2 次确认）';}
 if(code!==scanLastCode){scanLastCode=code;scanHits=1;return;}
 if(++scanHits<2)return;
 scanCapturing=true;
 try{
  const video=document.querySelector('#quaggaViewport video');
  if(!video?.videoWidth)throw new Error('摄像头画面尚未就绪，请重扫');
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
  const photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85));
  if(!photo)throw new Error('自动拍照失败，请重扫');
  stopScan();await handleScanResult(code,photo);
 }catch(e){stopScan();toast(e.message,'error');}finally{scanCapturing=false;}
}
function stopScan(){try{if(typeof Quagga!=='undefined'){Quagga.offDetected();Quagga.stop();}}catch(e){}quaggaRunning=false;document.getElementById('cameraWrap')?.remove();}
async function handleScanResult(code,photo){
 const row={file:photo,preview:URL.createObjectURL(photo),name:'扫码自动拍照',tracking:code,message:'匹配完整运单号',done:false};
 photoBatch.unshift(row);renderPhotoBatch();await matchAndSubmitPhoto(row,'scan');
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScan();});

let listPage = 1;
let pendingRows=[];
async function renderList(c) {
  c.innerHTML = `<div id="listBox"><div class="loading">加载中</div></div>
    <div class="bottom-bar" id="pager" style="display:none;">
      <button class="btn-default" id="prevBtn">上一页</button>
      <button class="btn-default" id="nextBtn">下一页</button>
    </div>`;
  loadList();
}
async function loadList() {
  const j = await get(`api/intercepts.php?action=courier_pending&page=${listPage}&size=20`);
  const el = document.getElementById('listBox');
  if (!el) return;
  if (j.code !== 0) return toast(j.msg, 'error');
  const d = j.data;
  pendingRows=d.list;
  if (!d.list.length) { el.innerHTML = '<div class="empty">🎉 没有待退回的拦截件</div>'; return; }
  el.innerHTML = `<div style="margin-bottom:10px;color:var(--text-light);">共 ${d.total} 条待退回，第 ${d.page} 页</div>` +
    d.list.map(r => `<div class="list-item">
      <div class="info">
        <div class="no">${esc(r.tracking_no)}</div>
        
        <div class="time">拦截：${fmt(r.intercepted_at)}</div>
      </div>
      <span style="color:var(--text-light)">请扫码或上传照片退回</span>
    </div>`).join('');
  const pager = document.getElementById('pager');
  pager.style.display = 'flex';
  document.getElementById('prevBtn').onclick = () => { if (listPage > 1) { listPage--; loadList(); } };
  document.getElementById('nextBtn').onclick = () => { if (listPage * 20 < d.total) { listPage++; loadList(); } };
}
/* ---------- 启动 ---------- */
render();

let refreshing = false;
async function refreshCourier() {
  if (!TOKEN || document.hidden || refreshing) return;
  refreshing = true;
  try { await loadStats(); if (currentTab === 'list' && document.getElementById('listBox')) await loadList(); }
  finally { refreshing = false; }
}
setInterval(refreshCourier, 15000);
document.addEventListener('visibilitychange', refreshCourier);
