window.__halaBooted = true;
import { supabase, isSupabaseConfigured, verifyAdmin } from './supabase.js';
import { APP_CONFIG } from './config.js';

const app = document.getElementById('app');
const ADMIN_PUSH_FUNCTION_URL = `${APP_CONFIG.supabaseUrl}/functions/v1/admin-onesignal-push`;

async function callAdminPushDeviceApi(action, subscriptionId, extra = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('انتهت جلسة الإدارة. سجّل الدخول من جديد.');

  const response = await fetch(ADMIN_PUSH_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, subscription_id: subscriptionId, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error || `تعذر تسجيل جهاز الإدارة (${response.status}).`);
  }
  return payload;
}

function adminPushPlatform() {
  if (/iPad/i.test(navigator.userAgent)) return 'iPadOS';
  if (/iPhone|iPod/i.test(navigator.userAgent)) return 'iOS';
  if (/Android/i.test(navigator.userAgent)) return 'Android';
  return 'Web';
}

async function registerAdminPushDevice(subscriptionId) {
  if (!subscriptionId) throw new Error('لم يتم إنشاء Subscription ID بعد.');
  return callAdminPushDeviceApi('register_device', subscriptionId, {
    platform: adminPushPlatform(),
    user_agent: navigator.userAgent || '',
  });
}

async function unregisterAdminPushDevice(subscriptionId) {
  if (!subscriptionId) return { ok: true };
  return callAdminPushDeviceApi('unregister_device', subscriptionId);
}

async function deactivateCurrentPushDevice() {
  return new Promise((resolve) => {
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(); } };
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        const id = String(OneSignal?.User?.PushSubscription?.id || '').trim();
        if (id) await unregisterAdminPushDevice(id);
      } catch (e) {
        console.warn('Push device unregister failed:', e);
      } finally { done(); }
    });
    setTimeout(done, 1800);
  });
}

const icons = {
  dashboard: '▦', orders: '🧾', stores: '🏪', drivers: '🚚', users: '👥',
  reports: '📊', system: '⚙', settings: '🛡️', logout: '↪', menu: '☰', bell: '🔔'
};

const navItems = [
  ['dashboard', 'لوحة المتابعة اليومية'],
  ['orders', 'الطلبات'],
  ['stores', 'المتاجر / المطاعم'],
  ['drivers', 'السائقون'],
  ['users', 'المستخدمون'],
  ['reports', 'التقارير والتحليلات'],
  ['system', 'إدارة النظام'],
  ['settings', 'الأمان والصلاحيات'],
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function fmtNumber(v) { const n = Number(v ?? 0); return n === 0 ? '0' : n.toLocaleString('ar-IQ'); }
function fmtMoney(v) { return `${Number(v || 0).toLocaleString('ar-IQ', { maximumFractionDigits: 2 })} د.ع`; }
function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v); if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-IQ', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function todayStartIso() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }

function renderSetup() {
  app.innerHTML = `<main class="auth-shell"><section class="brand-panel"><div class="brand-mark">هـ</div><div><span class="eyebrow">Hala Talab Admin</span><h1>لوحة إدارة هلا طلب</h1><p>أدخل بيانات Supabase العامة في js/config.js لتفعيل الدخول.</p></div></section><section class="auth-card setup-card"><div class="auth-card-head"><span class="pill">إدارة هلا طلب</span><h2>إعداد الاتصال</h2><p>ضع Project URL و Publishable key فقط.</p></div><div class="security-note"><strong>أمان مهم</strong><span>لا تستخدم service_role أو أي Secret key داخل الويب.</span></div></section></main>`;
}
function renderLogin(message = '') {
  app.innerHTML = `<main class="auth-shell"><section class="brand-panel"><div class="brand-mark">هـ</div><div><span class="eyebrow">Hala Talab Admin</span><h1>إدارة المنظومة من مكان واحد</h1><p>لوحة ويب مخصصة لحسابات الإدارة فقط، مرتبطة بنفس Supabase الخاص بهلا طلب.</p></div><div class="brand-points"><div><b>01</b><span>متابعة الطلبات والمنصة</span></div><div><b>02</b><span>إدارة المتاجر والسائقين</span></div><div><b>03</b><span>تقارير وصلاحيات الإدارة</span></div></div></section><section class="auth-card"><div class="auth-card-head"><span class="pill">بوابة الإدارة</span><h2>تسجيل الدخول</h2><p>استخدم حساب الإدارة المخوّل في Supabase.</p></div>${message ? `<div class="alert error">${escapeHtml(message)}</div>` : ''}<form id="loginForm" class="form-stack"><label>البريد الإلكتروني<input id="email" type="email" autocomplete="email" required /></label><label>كلمة المرور<input id="password" type="password" autocomplete="current-password" required minlength="6" /></label><button id="loginBtn" class="primary-btn" type="submit">دخول لوحة الإدارة</button></form><p class="auth-foot">الدخول مقيد بصلاحية <b>admin</b>.</p></section></main>`;
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
}
async function handleLogin(event) {
  event.preventDefault(); const button = document.getElementById('loginBtn'); button.disabled = true; button.textContent = 'جارٍ التحقق...';
  const email = document.getElementById('email').value.trim(); const password = document.getElementById('password').value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return renderLogin(error?.message || 'تعذر تسجيل الدخول.');
  if (!await verifyAdmin(data.user)) { await supabase.auth.signOut(); return renderLogin('هذا الحساب غير مخوّل للدخول إلى لوحة الإدارة.'); }
  renderDashboard(data.user);
}
function renderDashboard(user) {
  app.innerHTML = `<div class="dashboard-shell"><aside class="sidebar" id="sidebar"><div class="sidebar-brand"><div class="brand-mark small">هـ</div><div><strong>هلا طلب</strong><span>لوحة الإدارة</span></div></div><nav class="sidebar-nav">${navItems.map(([id,label],i)=>`<button class="nav-item ${i===0?'active':''}" data-page="${id}"><span>${icons[id]}</span>${label}</button>`).join('')}</nav><button id="logoutBtn" class="nav-item logout"><span>${icons.logout}</span>تسجيل الخروج</button></aside><div class="main-area"><header class="topbar"><button id="menuBtn" class="icon-btn mobile-only">${icons.menu}</button><div class="page-title"><span>الإدارة</span><h1 id="pageTitle">لوحة المتابعة اليومية</h1></div><div class="top-actions"><button id="pushEnableBtn" class="icon-btn notification-bell" aria-label="تفعيل إشعارات الهاتف" title="تفعيل إشعارات الهاتف">📲</button><button id="pinBellBtn" class="icon-btn notification-bell pin-bell" aria-label="طلبات استرجاع PIN">🔐<span id="pinBellBadge" class="notification-badge hidden">0</span></button><button id="adminBellBtn" class="icon-btn notification-bell" aria-label="إشعارات الإدارة">${icons.bell}<span id="adminBellBadge" class="notification-badge hidden">0</span></button><div class="admin-chip"><div class="avatar">${escapeHtml((user.email||'A')[0].toUpperCase())}</div><div><strong>مدير النظام</strong><span>${escapeHtml(user.email||'')}</span></div></div></div></header><main class="content" id="content"></main></div><div class="sidebar-overlay" id="sidebarOverlay"></div></div>`;
  wireDashboard(); wireAdminNotifications(); wirePhonePush(user); renderStageTwoDashboard(); consumePushDeepLinkFromUrl();
}


function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalonePwa() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}
function browserNotificationPermission(){
  return typeof Notification !== 'undefined' ? Notification.permission : 'default';
}
function sleepMs(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }
function oneSignalPushSnapshot(OneSignal){
  const push=OneSignal?.User?.PushSubscription;
  const permission=OneSignal?.Notifications?.permission === true;
  const optedIn=push?.optedIn === true;
  const id=String(push?.id || '').trim();
  const token=String(push?.token || '').trim();
  return {
    permission,
    optedIn,
    id,
    token,
    healthy: permission && optedIn && Boolean(id) && Boolean(token),
    paused: permission && !optedIn && Boolean(id) && Boolean(token),
    pending: permission && (!id || !token),
  };
}
async function waitForHealthyPush(OneSignal, timeoutMs=20000){
  const started=Date.now();
  let state=oneSignalPushSnapshot(OneSignal);
  while(!state.healthy && Date.now()-started < timeoutMs){
    await sleepMs(500);
    state=oneSignalPushSnapshot(OneSignal);
  }
  return state;
}
function wirePhonePush(user) {
  const btn = document.getElementById('pushEnableBtn');
  if (!btn) return;

  let registeredSubscriptionId = '';
  let registrationError = '';

  const setState = (state) => {
    btn.dataset.pushState = state;
    if (state === 'on') { btn.textContent='✅'; btn.title='إشعارات الهاتف مفعلة ومسجلة للإدارة'; btn.setAttribute('aria-label','إشعارات الهاتف مفعلة'); }
    else if (state === 'paused') { btn.textContent='🔕'; btn.title='إشعارات الهاتف متوقفة على هذا الجهاز'; btn.setAttribute('aria-label','إشعارات الهاتف متوقفة'); }
    else if (state === 'pending') { btn.textContent='⏳'; btn.title='جارٍ إكمال تسجيل إشعارات هذا الجهاز'; btn.setAttribute('aria-label','جارٍ إكمال تسجيل الإشعارات'); }
    else if (state === 'server_error') { btn.textContent='⚠️'; btn.title='اشتراك الهاتف موجود لكن تسجيله في نظام الإدارة لم يكتمل'; btn.setAttribute('aria-label','تسجيل جهاز الإدارة يحتاج إصلاح'); }
    else if (state === 'blocked') { btn.textContent='🚫'; btn.title='الإشعارات مرفوضة من إعدادات الجهاز'; btn.setAttribute('aria-label','الإشعارات مرفوضة من إعدادات الجهاز'); }
    else if (state === 'unsupported') { btn.textContent='—'; btn.title='الإشعارات غير مدعومة على هذا المتصفح'; btn.setAttribute('aria-label','الإشعارات غير مدعومة'); }
    else { btn.textContent='📲'; btn.title='تفعيل إشعارات الهاتف'; btn.setAttribute('aria-label','تفعيل إشعارات الهاتف'); }
  };

  const classify = (OneSignal) => {
    try {
      if (OneSignal?.Notifications?.isPushSupported && !OneSignal.Notifications.isPushSupported()) return ['unsupported', oneSignalPushSnapshot(OneSignal)];
    } catch (_) {}
    const s = oneSignalPushSnapshot(OneSignal);
    if (browserNotificationPermission() === 'denied') return ['blocked', s];
    if (s.paused) return ['paused', s];
    if (s.pending) return ['pending', s];
    if (s.healthy && registeredSubscriptionId === s.id) return ['on', s];
    if (s.healthy && registrationError) return ['server_error', s];
    if (s.healthy) return ['pending', s];
    return ['off', s];
  };

  const ensureRegistered = async (OneSignal) => {
    const s = oneSignalPushSnapshot(OneSignal);
    if (!s.healthy) return s;
    if (registeredSubscriptionId === s.id) return s;
    try {
      await registerAdminPushDevice(s.id);
      registeredSubscriptionId = s.id;
      registrationError = '';
    } catch (e) {
      registrationError = e?.message || String(e);
      console.warn('Admin push device registration failed:', e);
      throw e;
    }
    return s;
  };

  const refreshWith = async (OneSignal) => {
    try {
      const snapshot = oneSignalPushSnapshot(OneSignal);
      if (snapshot.healthy) {
        try { await ensureRegistered(OneSignal); } catch (_) {}
      }
      const [state] = classify(OneSignal);
      setState(state);
      return snapshot;
    } catch (e) {
      console.warn('Push status refresh failed:', e);
      setState('server_error');
      return null;
    }
  };

  const refresh = () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) { await refreshWith(OneSignal); });
  };

  const connectDevice = async (OneSignal) => {
    if (OneSignal.Notifications.permission !== true) await OneSignal.Notifications.requestPermission();
    if (OneSignal.Notifications.permission !== true) throw new Error('لم يتم منح إذن الإشعارات من الجهاز.');
    setState('pending');
    await OneSignal.User.PushSubscription.optIn();
    const finalState = await waitForHealthyPush(OneSignal, 20000);
    if (!finalState.healthy) throw new Error('لم يكتمل إنشاء اشتراك OneSignal لهذا الجهاز.');
    await ensureRegistered(OneSignal);
    setState('on');
    return finalState;
  };

  const openManager = (OneSignal) => {
    document.getElementById('pushManagerModal')?.remove();
    const s = oneSignalPushSnapshot(OneSignal);
    const registered = Boolean(s.id && registeredSubscriptionId === s.id);
    const statusText = registered && s.healthy ? 'مفعلة ومسجلة وجاهزة للاستلام' : s.paused ? 'متوقفة على هذا الجهاز' : s.pending ? 'جارٍ إكمال التسجيل' : registrationError ? 'اشتراك الهاتف موجود لكن تسجيل الإدارة لم يكتمل' : 'غير مفعلة';
    const idText = s.id ? `${s.id.slice(0,8)}…${s.id.slice(-6)}` : 'سيُنشأ تلقائيًا';
    const overlay = document.createElement('div');
    overlay.className='modal-overlay'; overlay.id='pushManagerModal';
    overlay.innerHTML=`<section class="modal-card small-modal"><div class="modal-head"><div><span class="pill">إشعارات الإدارة</span><h2>إشعارات هذا الجهاز</h2><p class="modal-subtitle">الحالة: <strong>${escapeHtml(statusText)}</strong></p></div><button class="icon-btn" id="pushManagerClose">×</button></div><div class="push-health-box"><div><span>إذن النظام</span><strong>${s.permission?'مسموح':'غير مسموح'}</strong></div><div><span>اشتراك OneSignal</span><strong>${s.optedIn?'مفعّل':'غير مفعّل'}</strong></div><div><span>Subscription ID</span><strong dir="ltr">${escapeHtml(idText)}</strong></div><div><span>مسجل في نظام الإدارة</span><strong>${registered?'نعم ✓':'ليس بعد'}</strong></div></div><div class="inline-actions push-manager-actions"><button class="primary-btn" id="pushRepairBtn">ربط الإشعارات الآن</button>${s.healthy?'<button class="secondary-btn" id="pushStopBtn">إيقاف إشعارات هذا الجهاز</button>':''}</div><div id="pushManagerMessage" class="panel-note">${registrationError?escapeHtml(registrationError):''}</div></section>`;
    document.body.appendChild(overlay);
    const close=()=>overlay.remove(); overlay.querySelector('#pushManagerClose').onclick=close; overlay.addEventListener('click',e=>{if(e.target===overlay)close();});

    overlay.querySelector('#pushRepairBtn').onclick=async()=>{
      const repairBtn=overlay.querySelector('#pushRepairBtn'); const msg=overlay.querySelector('#pushManagerMessage');
      repairBtn.disabled=true; repairBtn.textContent='جارٍ الربط…'; msg.textContent='';
      try {
        await connectDevice(OneSignal);
        msg.textContent='تم ربط هذا الجهاز بنظام إشعارات الإدارة بنجاح ✓';
        setTimeout(close,900);
      } catch (e) {
        registrationError=e?.message||String(e);
        msg.textContent='تعذر الربط: '+registrationError;
        await refreshWith(OneSignal);
      } finally { repairBtn.disabled=false; repairBtn.textContent='ربط الإشعارات الآن'; }
    };

    const stopBtn=overlay.querySelector('#pushStopBtn');
    if (stopBtn) stopBtn.onclick=async()=>{
      stopBtn.disabled=true;
      try {
        if (s.id) await unregisterAdminPushDevice(s.id);
        registeredSubscriptionId=''; registrationError='';
        await OneSignal.User.PushSubscription.optOut();
        setState('paused');
        overlay.querySelector('#pushManagerMessage').textContent='تم إيقاف إشعارات هذا الجهاز.';
        setTimeout(close,700);
      } catch (e) {
        overlay.querySelector('#pushManagerMessage').textContent='تعذر الإيقاف: '+(e?.message||String(e));
      } finally { stopBtn.disabled=false; }
    };
  };

  btn.addEventListener('click', () => {
    if (isIosDevice() && !isStandalonePwa()) {
      alert('على iPhone و iPad افتح لوحة الإدارة من الأيقونة المثبتة على الشاشة الرئيسية، ثم فعّل الإشعارات مرة واحدة.');
      return;
    }
    btn.disabled=true;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        const [state]=classify(OneSignal);
        if (state==='unsupported') { alert('هذا المتصفح لا يدعم إشعارات الويب على هذا الجهاز.'); return; }
        if (state==='blocked') { alert('الإشعارات مرفوضة من إعدادات الجهاز. فعّل السماح بالإشعارات لتطبيق إدارة هلا طلب ثم ارجع للوحة.'); return; }
        if (state==='on' || state==='paused' || state==='server_error') { openManager(OneSignal); return; }
        await connectDevice(OneSignal);
        alert('تم تفعيل وربط إشعارات هلا طلب على هذا الجهاز.');
      } catch (error) {
        registrationError=error?.message||String(error);
        console.warn('Push activation failed:', error);
        await refreshWith(OneSignal);
        openManager(OneSignal);
      } finally { btn.disabled=false; }
    });
  });

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function(OneSignal) {
    try {
      OneSignal.User.PushSubscription.addEventListener('change', async()=>{ registeredSubscriptionId=''; registrationError=''; await refreshWith(OneSignal); });
      OneSignal.Notifications.addEventListener('permissionChange', async()=>{ await refreshWith(OneSignal); });
      await refreshWith(OneSignal);
    } catch (e) { console.warn('Push listener setup failed:', e); }
  });
  window.addEventListener('hala-onesignal-ready', refresh, { once:true });
  setTimeout(refresh, 1200);
}



/* =========================================================
   Admin Stage 36 — Central push deep links.
   One server-side notification path serves iOS/iPadOS/Android.
   ========================================================= */
function consumePushDeepLinkFromUrl() {
  try {
    const url = new URL(window.location.href);
    const target = String(url.searchParams.get('admin_target') || '').trim();
    const id = String(url.searchParams.get('target_id') || '').trim();
    if (!target) return;

    const targets = {
      'pin-customers': { page:'system', systemTab:'pin-customers', type:'pin_reset' },
      'pin-partners': { page:'system', systemTab:'pin-partners', type:'pin_reset' },
      'stores': { page:'stores', systemTab:null, type:'store_review' },
      'drivers': { page:'drivers', systemTab:null, type:'driver_review' },
    };
    const cfg = targets[target];
    if (!cfg) return;

    if (id) pendingAdminNavigationTarget = { page:cfg.page, id, type:cfg.type };
    setTimeout(() => navigateAdminPage(cfg.page, cfg.systemTab), 180);

    url.searchParams.delete('admin_target');
    url.searchParams.delete('target_id');
    window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
  } catch (error) {
    console.warn('Push deep-link handling failed:', error);
  }
}

async function countTable(table, filterBuilder = null) {
  try {
    let q = supabase.from(table).select('*', { count:'exact', head:true });
    if (filterBuilder) q = filterBuilder(q);
    const { count, error } = await q; if (error) return { ok:false, table, error:error.message };
    return { ok:true, table, count:count || 0 };
  } catch (e) { return { ok:false, table, error:String(e) }; }
}
async function firstAvailableCount(candidates) {
  for (const t of candidates || []) { const r = await countTable(t); if (r.ok) return r; }
  return { ok:false, count:null, table:null };
}
async function firstAvailableRows(candidates, limit=8) {
  for (const t of candidates || []) {
    let query = supabase.from(t).select('*').limit(limit);
    let r = await query.order('created_at', { ascending:false });
    if (r.error && /created_at/i.test(r.error.message || '')) r = await supabase.from(t).select('*').limit(limit);
    if (!r.error) return { ok:true, table:t, rows:r.data || [] };
  }
  return { ok:false, table:null, rows:[] };
}
function pick(obj, names, fallback='—') { for (const n of names) if (obj?.[n] !== undefined && obj?.[n] !== null && obj?.[n] !== '') return obj[n]; return fallback; }
function numericPick(obj, names) { const v = pick(obj,names,null); const n = Number(v); return Number.isFinite(n) ? n : 0; }
function statusLabel(v='') {
  const s=String(v).toLowerCase(); const map={pending:'جديد',new:'جديد',accepted:'مقبول',assigned:'تم تعيين سائق',preparing:'قيد التحضير',ready:'جاهز للاستلام',picked_up:'تم الاستلام',delivered:'تم التسليم',cancelled:'ملغي',canceled:'ملغي'}; return map[s] || v || '—';
}
async function loadDistinctDriversFromOrders(orderTable) {
  if (!orderTable) return { ok:false, table:null, count:null, source:'orders.driver_id' };
  try {
    const { data, error } = await supabase
      .from(orderTable)
      .select('driver_id')
      .not('driver_id', 'is', null)
      .limit(10000);
    if (error) return { ok:false, table:orderTable, count:null, source:'orders.driver_id', error:error.message };
    const ids = new Set((data || []).map(r => r.driver_id).filter(Boolean));
    return { ok:true, table:orderTable, count:ids.size, source:'orders.driver_id' };
  } catch (e) {
    return { ok:false, table:orderTable, count:null, source:'orders.driver_id', error:String(e) };
  }
}

function detectDateField(rows) {
  const preferred = ['created_at','placed_at','ordered_at','order_date','inserted_at','updated_at'];
  for (const key of preferred) {
    if ((rows || []).some(r => r?.[key] && !Number.isNaN(new Date(r[key]).getTime()))) return key;
  }
  const keys = new Set();
  for (const row of (rows || [])) Object.keys(row || {}).forEach(k => { if (/_at$|date/i.test(k)) keys.add(k); });
  for (const key of keys) {
    if ((rows || []).some(r => r?.[key] && !Number.isNaN(new Date(r[key]).getTime()))) return key;
  }
  return null;
}
function isTodayLocal(value) {
  if (!value) return false;
  const d = new Date(value); if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}
async function loadAllRows(table, limit=5000) {
  try {
    const { data, error } = await supabase.from(table).select('*').limit(limit);
    if (error) return { ok:false, table, rows:[], error:error.message };
    return { ok:true, table, rows:data || [] };
  } catch (e) { return { ok:false, table, rows:[], error:String(e) }; }
}
async function loadDashboardData() {
  const cfg = APP_CONFIG.dashboardTables || {};
  const orderCandidates = cfg.orders || ['orders'];
  const [ordersAll, stores, support] = await Promise.all([
    firstAvailableCount(orderCandidates),
    firstAvailableCount(cfg.stores || []),
    firstAvailableCount(cfg.support || [])
  ]);

  let todayOrders = { ok:false, count:null, table:ordersAll.table || null, source:null };
  let revenue = 0;
  let recent = { ok:false, table:ordersAll.table || null, rows:[] };
  let orderRows = [];
  let dateField = null;

  if (ordersAll.ok) {
    const all = await loadAllRows(ordersAll.table, 5000);
    if (all.ok) {
      orderRows = all.rows;
      dateField = detectDateField(orderRows);
      if (dateField) {
        const todayRows = orderRows.filter(r => isTodayLocal(r[dateField]));
        todayOrders = { ok:true, count:todayRows.length, table:ordersAll.table, source:dateField };
        revenue = todayRows.reduce((sum,row)=>sum + numericPick(row,['total_amount','grand_total','total','amount','final_total','order_total','total_price']),0);
        recent = {
          ok:true,
          table:ordersAll.table,
          rows:[...orderRows].sort((a,b)=>new Date(b?.[dateField]||0)-new Date(a?.[dateField]||0)).slice(0,8)
        };
      } else {
        // Orders are readable but the current schema has no usable timestamp column.
        todayOrders = { ok:false, count:null, table:ordersAll.table, source:null, error:'no_date_field' };
        recent = { ok:true, table:ordersAll.table, rows:orderRows.slice(-8).reverse() };
      }
    }
  }

  const drivers = ordersAll.ok
    ? await loadDistinctDriversFromOrders(ordersAll.table)
    : { ok:false, table:null, count:null, source:'orders.driver_id' };

  return { ordersAll, todayOrders, stores, drivers, support, recent, revenue, dateField };
}
function metricCard(label, value, note, icon, state='') { return `<article class="metric-card ${state}"><div class="metric-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div></article>`; }
function actionMetricCard(label,value,note,icon,action,valueKey=''){return `<button type="button" class="metric-card metric-action-card" data-metric-action="${action}" data-metric-value="${valueKey}"><div class="metric-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div><span class="metric-action-hint">عرض التفاصيل ←</span></button>`;}
function renderLoading() { document.getElementById('content').innerHTML = `<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تحميل بيانات Supabase الحقيقية...</h2><p>يتم الآن قراءة مؤشرات المنصة بدون بيانات تجريبية.</p></section>`; }
const ADMIN_READ_NOTIFICATIONS_KEY = 'hala_admin_read_notifications_v1';
let adminNotificationState = { items: [], unread: 0, loadedAt: null };
let adminNotificationGroupFilter = 'all';
let adminSecuritySubFilter = 'all';

function readNotificationKeys() {
  try { return new Set(JSON.parse(localStorage.getItem(ADMIN_READ_NOTIFICATIONS_KEY) || '[]')); }
  catch (_) { return new Set(); }
}
function saveNotificationKeys(keys) {
  try { localStorage.setItem(ADMIN_READ_NOTIFICATIONS_KEY, JSON.stringify([...keys].slice(-300))); } catch (_) {}
}
function notificationKey(item) { return `${item.type}:${item.id || item.label || ''}`; }
function rowAgeMinutes(value) {
  if (!value) return 0; const t = new Date(value).getTime(); if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}
function humanDurationMinutes(totalMinutes) {
  const mins=Math.max(0,Math.floor(Number(totalMinutes)||0));
  if(mins<60) return `${fmtNumber(mins)} دقيقة`;
  const days=Math.floor(mins/1440);
  const hours=Math.floor((mins%1440)/60);
  const rem=mins%60;
  const parts=[];
  if(days) parts.push(`${fmtNumber(days)} ${days===1?'يوم':'أيام'}`);
  if(hours) parts.push(`${fmtNumber(hours)} ${hours===1?'ساعة':'ساعات'}`);
  if(!days && rem) parts.push(`${fmtNumber(rem)} دقيقة`);
  return parts.join(' و') || 'أقل من دقيقة';
}
let pendingAdminNavigationTarget=null;
async function safeRows(table) {
  try { const {data,error}=await supabase.from(table).select('*').limit(5000); return error?{ok:false,rows:[],error:error.message}:{ok:true,rows:data||[]}; }
  catch(e){ return {ok:false,rows:[],error:String(e)}; }
}
async function safeAdminUsers() {
  try { const {data,error}=await supabase.rpc('admin_list_users'); return error?{ok:false,rows:[],error:error.message}:{ok:true,rows:data||[]}; }
  catch(e){ return {ok:false,rows:[],error:String(e)}; }
}
function withinDays(value, days=7) {
  if(!value) return false;
  const t=new Date(value).getTime(); if(!Number.isFinite(t)) return false;
  return (Date.now()-t) <= days*24*60*60*1000;
}
async function loadAdminNotifications() {
  const [ordersR, storesR, storeReviewsR, profilesR, driverReviewsR, supportR, supportMessagesR, partnerSupportR, partnerSupportMessagesR, pinResetR, usersR] = await Promise.all([
    safeRows('orders'), safeRows('stores'), safeRows('admin_store_reviews'), safeRows('partner_profiles'), safeRows('admin_driver_reviews'), safeRows('customer_support_conversations'), safeRows('customer_support_messages'), safeRows('partner_support_tickets'), safeRows('partner_support_messages'), safeRows('phone_pin_reset_requests'), safeAdminUsers()
  ]);
  const items=[];
  const read=readNotificationKeys();
  const storeReviewMap=new Map((storeReviewsR.rows||[]).map(r=>[String(r.store_id),String(r.review_status||'pending')]));
  for(const st of storesR.rows||[]){
    const status=storeReviewMap.get(String(st.id))||'pending';
    const active=pick(st,['is_active','active','enabled'],null);
    const time=pick(st,['updated_at','created_at'],null);
    if(status==='pending') items.push({type:'store_review',group:'access',id:st.id,label:`متجر ينتظر المراجعة: ${storeName(st)}`,page:'stores',icon:'🏪',time,priority:5});
    else if(status==='approved' && active===false) items.push({type:'store_activation',group:'stores',id:st.id,label:`متجر مقبول ينتظر التفعيل: ${storeName(st)}`,page:'stores',icon:'✅',time,priority:5});
    else if(status==='approved') items.push({type:'store_approved',group:'stores',id:st.id,label:`متجر مقبول ومفعّل: ${storeName(st)}`,page:'stores',icon:'✅',time,priority:2});
    else if(status==='rejected') items.push({type:'store_rejected',group:'stores',id:st.id,label:`متجر مرفوض: ${storeName(st)}`,page:'stores',icon:'⛔',time,priority:2});
  }
  for(const u of usersR.rows||[]){
    items.push({type:'new_user',group:'users',id:u.user_id,label:`مستخدم: ${userDisplayName(u)} · ${userTypeLabel(u.effective_type)}`,page:'users',icon:'👤',time:u.created_at||u.updated_at||null,priority:2});
  }
  const driverReviewMap=new Map((driverReviewsR.rows||[]).map(r=>[String(r.driver_id),String(r.review_status||'pending')]));
  for(const p of profilesR.rows||[]){
    if(String(p.partner_type||'').toLowerCase()!=='driver') continue;
    const status=driverReviewMap.get(String(p.id))||'pending';
    const label=status==='pending'?'سائق ينتظر المراجعة':status==='approved'?'سائق مقبول':'سائق مرفوض';
    items.push({type:'driver_review',group:status==='pending'?'access':'drivers',id:p.id,label:`${label}: ${pick(p,['full_name','email'],'سائق')}`,page:'drivers',icon:'🚚',time:pick(p,['updated_at','created_at'],null),priority:status==='pending'?6:2});
  }
  for(const o of ordersR.rows||[]){
    const st=normalizeStatus(pick(o,['status','order_status'],''));
    const dt=orderDateValue(o); const age=rowAgeMinutes(dt);
    if(st==='pending') items.push({type:'new_order',group:'orders',id:o.id,label:`طلب جديد رقم ${orderDisplayNo(o)}`,page:'orders',icon:'🧾',time:dt,priority:4});
    else if(!['delivered','cancelled'].includes(st) && age>=45) items.push({type:'late_order',group:'orders',id:o.id,label:`طلب متأخر رقم ${orderDisplayNo(o)} · منذ ${humanDurationMinutes(age)}`,page:'orders',icon:'⏱️',time:dt,priority:5});
  }
  const supportById=new Map((supportR.rows||[]).map(c=>[String(c.id),c]));
  for(const m of supportMessagesR.rows||[]){
    if(String(pick(m,['sender_type','sender_role'],'')).toLowerCase()!=='customer') continue;
    const conversationId=String(pick(m,['conversation_id'],'')||'');
    const c=supportById.get(conversationId);
    const subject=c?pick(c,['subject_ar','subject','subject_en'],''):'';
    items.push({type:'support_message',group:'support',id:m.id,conversationId,label:`رسالة دعم جديدة${subject?`: ${subject}`:''}`,page:'system',systemTab:'support',icon:'🎧',time:pick(m,['created_at','sent_at'],null),priority:5});
  }
  for(const c of supportR.rows||[]){
    const status=String(pick(c,['status','state'],'open')).toLowerCase();
    if(!['closed','resolved','done'].includes(status) && !(supportMessagesR.rows||[]).some(m=>String(m.conversation_id)===String(c.id))) items.push({type:'support',group:'support',id:c.id,conversationId:c.id,label:`محادثة دعم تحتاج متابعة${pick(c,['subject_ar','subject','subject_en'],'')?`: ${pick(c,['subject_ar','subject','subject_en'],'')}`:''}`,page:'system',systemTab:'support',icon:'🎧',time:pick(c,['created_at','updated_at'],null),priority:4});
  }
  const partnerById=new Map((partnerSupportR.rows||[]).map(t=>[String(t.id),t]));
  for(const m of partnerSupportMessagesR.rows||[]){
    const role=String(pick(m,['sender_role','sender_type'],'')).toLowerCase();
    if(['admin','support','management'].includes(role)) continue;
    if(m.is_read===true) continue;
    const ticketId=String(pick(m,['ticket_id'],'')||'');
    const t=partnerById.get(ticketId);
    const who=role==='driver'?'السائق':'المتجر';
    const subject=t?pick(t,['subject_ar','subject','title','category'],''):'';
    items.push({type:'partner_support_message',group:'support',id:m.id,conversationId:ticketId,label:`رسالة جديدة من ${who}${subject?`: ${subject}`:''}`,page:'system',systemTab:'support',icon:'🎧',time:pick(m,['created_at','sent_at'],null),priority:6,source:'partner'});
  }
  for(const t of partnerSupportR.rows||[]){
    const status=String(pick(t,['status','state'],'open')).toLowerCase();
    const hasMessage=(partnerSupportMessagesR.rows||[]).some(m=>String(m.ticket_id)===String(t.id));
    if(!['closed','resolved','done'].includes(status) && !hasMessage) items.push({type:'partner_support',group:'support',id:t.id,conversationId:t.id,label:`تذكرة دعم جديدة من ${String(pick(t,['category'],'')).toLowerCase().startsWith('driver_')?'السائق':'المتجر'}`,page:'system',systemTab:'support',icon:'🎧',time:pick(t,['created_at','updated_at'],null),priority:6,source:'partner'});
  }
  for(const r of pinResetR.rows||[]){
    if(!['pending','issued'].includes(String(r.status||'').toLowerCase())) continue;
    const who=r.account_role==='driver'?'سائق':r.account_role==='business'?'متجر':'عميل';
    items.push({type:'pin_reset',group:'pin',id:r.id,label:`طلب استرجاع PIN من ${who}: ${r.phone_e164||''}`,page:'system',systemTab:r.account_role==='customer'?'pin-customers':'pin-partners',icon:'🔐',time:r.requested_at||r.updated_at||null,priority:7});
  }
  items.sort((a,b)=>(new Date(b.time||0)-new Date(a.time||0))||(b.priority-a.priority)||String(b.id||'').localeCompare(String(a.id||'')));
  items.forEach(i=>i.read=read.has(notificationKey(i)));
  adminNotificationState={items,unread:items.filter(i=>!i.read).length,loadedAt:new Date()};
  updateAdminBell();
  updatePinBell();
  return adminNotificationState;
}
function isSecurityNotification(item){
  return ['pin','access'].includes(String(item?.group||''));
}
function updateAdminBell(){
  const badge=document.getElementById('adminBellBadge'); if(!badge)return;
  const n=(adminNotificationState.items||[]).filter(i=>!isSecurityNotification(i) && !i.read).length;
  badge.textContent=n>99?'99+':String(n); badge.classList.toggle('hidden',n===0);
}
function updatePinBell(){
  const badge=document.getElementById('pinBellBadge'); if(!badge)return;
  const n=(adminNotificationState.items||[]).filter(i=>isSecurityNotification(i) && !i.read).length;
  badge.textContent=n>99?'99+':String(n); badge.classList.toggle('hidden',n===0);
}

function navigateAdminPage(page, systemTab=null){
  // Deep-link notifications directly to their real destination.
  // For System tabs, set the destination BEFORE rendering the page so async loading
  // cannot leave the user on the generic "إدارة النظام" overview.
  if(page==='system' && systemTab && typeof systemPageState!=='undefined'){
    systemPageState.tab=systemTab;
  }
  const btn=document.querySelector(`.nav-item[data-page="${page}"]`);
  if(btn) btn.click();

  // Defensive retry for slower devices/browsers: if the tab UI appears later,
  // activate the requested tab and render its content again.
  if(page==='system' && systemTab){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const tabBtn=document.querySelector(`[data-system-tab="${systemTab}"]`);
      if(tabBtn){
        document.querySelectorAll('[data-system-tab]').forEach(x=>x.classList.toggle('active',x===tabBtn));
        if(typeof systemPageState!=='undefined') systemPageState.tab=systemTab;
        if(typeof renderSystemTab==='function') renderSystemTab();
        clearInterval(timer);
      }else if(tries>=20){
        clearInterval(timer);
      }
    },100);
  }
}
function markNotificationRead(item){
  const keys=readNotificationKeys(); keys.add(notificationKey(item)); saveNotificationKeys(keys); item.read=true;
  adminNotificationState.unread=adminNotificationState.items.filter(i=>!i.read).length; updateAdminBell(); updatePinBell();
}
function markVisibleNotificationsRead(){
  const securityMode=adminNotificationGroupFilter==='security';
  const keys=readNotificationKeys();
  (adminNotificationState.items||[]).filter(i=>securityMode?isSecurityNotification(i):!isSecurityNotification(i)).forEach(i=>{keys.add(notificationKey(i));i.read=true;});
  saveNotificationKeys(keys); adminNotificationState.unread=adminNotificationState.items.filter(i=>!i.read).length;
  updateAdminBell(); updatePinBell(); renderNotificationPanel();
}
function closeNotificationPanel(){ document.getElementById('adminNotificationPanel')?.remove(); }
function renderNotificationPanel(){
  closeNotificationPanel();
  const panel=document.createElement('div'); panel.id='adminNotificationPanel'; panel.className='notification-panel';
  const allItems=adminNotificationState.items||[];
  const securityMode=adminNotificationGroupFilter==='security';
  const items=allItems.filter(i=>securityMode?isSecurityNotification(i):!isSecurityNotification(i));
  const unread=items.filter(i=>!i.read).length;
  const groupCounts=items.reduce((a,i)=>{a[i.group||'other']=(a[i.group||'other']||0)+1;return a;},{});
  const groupLabel={all:'الكل',orders:'الطلبات',stores:'المتاجر',users:'المستخدمون',drivers:'السائقون',support:'الدعم',security:'التنبيهات المهمة'};
  const groupButton=(group,icon,label)=>`<button type="button" class="notification-scope-btn ${adminNotificationGroupFilter===group?'active':''}" data-notification-group="${group}">${icon} ${label} <b>${fmtNumber(group==='all'?items.length:(groupCounts[group]||0))}</b></button>`;
  let visibleItems=items;
  if(!securityMode && adminNotificationGroupFilter!=='all') visibleItems=items.filter(i=>(i.group||'other')===adminNotificationGroupFilter);
  const securityButton=(group,icon,label)=>`<button type="button" class="notification-scope-btn ${adminSecuritySubFilter===group?'active':''}" data-security-group="${group}">${icon} ${label} <b>${fmtNumber(group==='all'?items.length:(groupCounts[group]||0))}</b></button>`;
  const filters=securityMode
    ? `<div class="notification-scope-summary security-scope-summary">${securityButton('all','🛡️','الكل')}${securityButton('pin','🔐','استرجاع PIN')}${securityButton('access','➕','طلبات الانضمام')}</div>`
    : `<div class="notification-scope-summary">${groupButton('all','🔔','الكل')}${groupButton('orders','🧾','الطلبات')}${groupButton('stores','🏪','المتاجر')}${groupButton('users','👥','المستخدمون')}${groupButton('drivers','🚚','السائقون')}${groupButton('support','🎧','الدعم')}</div>`;
  if(securityMode && adminSecuritySubFilter!=='all') visibleItems=items.filter(i=>(i.group||'other')===adminSecuritySubFilter);
  panel.innerHTML=`<div class="notification-panel-head"><div><span>${securityMode?'تنبيهات الحسابات':'مركز التنبيهات'}</span><h3>${securityMode?'تنبيهات PIN والانضمام':'إشعارات الإدارة'}</h3><small class="notification-build">Stage 29 Mobile Core</small></div><div class="notification-head-actions"><button id="refreshAdminNotifications" class="icon-btn small">↻</button><button id="closeAdminNotifications" class="icon-btn small">✕</button></div></div>
    <div class="notification-summary"><b>${fmtNumber(unread)} غير مقروء</b><button id="markAllAdminNotifications" class="link-btn">تعليم الظاهر كمقروء</button></div>
    ${filters}
    <div class="notification-list">${visibleItems.length?visibleItems.slice(0,40).map(i=>{const idx=allItems.indexOf(i);return `<button class="notification-item ${i.read?'read':'unread'}" data-notification-index="${idx}"><span class="notification-item-icon">${i.icon}</span><span><b>${escapeHtml(i.label)}</b><small>${i.time?fmtDate(i.time):'الآن'}</small></span><i>›</i></button>`;}).join(''):`<div class="notification-empty">لا توجد إشعارات ضمن ${securityMode?'التنبيهات المهمة':(groupLabel[adminNotificationGroupFilter]||'هذا القسم')} حاليًا.</div>`}</div>`;
  document.body.appendChild(panel);
  document.getElementById('closeAdminNotifications').onclick=closeNotificationPanel;
  document.getElementById('refreshAdminNotifications').onclick=async()=>{await loadAdminNotifications();renderNotificationPanel();};
  document.getElementById('markAllAdminNotifications').onclick=markVisibleNotificationsRead;
  panel.querySelectorAll('[data-notification-group]').forEach(b=>b.addEventListener('click',()=>{adminNotificationGroupFilter=b.dataset.notificationGroup||'all';renderNotificationPanel();}));
  panel.querySelectorAll('[data-security-group]').forEach(b=>b.addEventListener('click',()=>{adminSecuritySubFilter=b.dataset.securityGroup||'all';renderNotificationPanel();}));
  panel.querySelectorAll('[data-notification-index]').forEach(b=>b.addEventListener('click',()=>{
    const i=adminNotificationState.items[Number(b.dataset.notificationIndex)];if(!i)return;
    markNotificationRead(i);closeNotificationPanel();
    pendingAdminNavigationTarget={page:i.page,id:i.conversationId||i.id,type:i.type};
    navigateAdminPage(i.page,i.systemTab);
    if(i.group==='support') setTimeout(()=>openSupportConversation(i.conversationId||i.id,i.source||''),250);
  }));
}
async function toggleNotificationPanel(){
  if(document.getElementById('adminNotificationPanel')) return closeNotificationPanel();
  if(!adminNotificationState.loadedAt) await loadAdminNotifications();
  renderNotificationPanel();
}
function wireAdminNotifications(){
  const bell=document.getElementById('adminBellBtn');
  const pinBell=document.getElementById('pinBellBtn');
  if(!bell && !pinBell)return;
  bell?.addEventListener('click',()=>{adminNotificationGroupFilter='all';toggleNotificationPanel();});
  pinBell?.addEventListener('click',async()=>{
    if(document.getElementById('adminNotificationPanel')) closeNotificationPanel();
    if(!adminNotificationState.loadedAt) await loadAdminNotifications();
    adminNotificationGroupFilter='security';
    adminSecuritySubFilter='all';
    renderNotificationPanel();
  });
  loadAdminNotifications();
  // PIN recovery, partner join requests, and support changes stay realtime globally.
  startSystemSupportRealtime();
  document.addEventListener('click',e=>{
    const panel=document.getElementById('adminNotificationPanel');
    if(panel && !panel.contains(e.target) && !bell?.contains(e.target) && !pinBell?.contains(e.target)) closeNotificationPanel();
  });
}

function consumePendingAdminTarget(page){
  if(!pendingAdminNavigationTarget || pendingAdminNavigationTarget.page!==page || !pendingAdminNavigationTarget.id) return;
  const target={...pendingAdminNavigationTarget};
  pendingAdminNavigationTarget=null;
  setTimeout(()=>{
    if(page==='stores'){
      const row=storesPageState.rows.find(r=>String(r.id)===String(target.id));
      if(row) openStoreDetails(row);
    } else if(page==='drivers'){
      const row=driversPageState.rows.find(r=>String(r.id)===String(target.id));
      if(row) openDriverDetails(row);
    } else if(page==='users'){
      const row=usersPageState.rows.find(r=>String(r.user_id)===String(target.id));
      if(row) openUserDetails(row);
    }
  },80);
}

async function loadPolishDashboardData(){
  const d=await loadDashboardData();
  const [storesR,storeReviewsR,profilesR,driverReviewsR,supportR]=await Promise.all([
    safeRows('stores'),safeRows('admin_store_reviews'),safeRows('partner_profiles'),safeRows('admin_driver_reviews'),safeRows('customer_support_conversations')
  ]);
  const storeReviewMap=new Map((storeReviewsR.rows||[]).map(r=>[String(r.store_id),String(r.review_status||'pending')]));
  const pendingStores=(storesR.rows||[]).filter(r=>(storeReviewMap.get(String(r.id))||'pending')==='pending').length;
  const driverReviewMap=new Map((driverReviewsR.rows||[]).map(r=>[String(r.driver_id),String(r.review_status||'pending')]));
  const drivers=(profilesR.rows||[]).filter(p=>String(p.partner_type||'').toLowerCase()==='driver');
  const pendingDrivers=drivers.filter(p=>(driverReviewMap.get(String(p.id))||'pending')==='pending').length;
  const openSupport=(supportR.rows||[]).filter(c=>!['closed','resolved','done'].includes(String(pick(c,['status','state'],'open')).toLowerCase())).length;
  const activeOrders=(d.recent?.table||d.ordersAll.table)?(await safeRows('orders')).rows.filter(o=>!['delivered','cancelled'].includes(normalizeStatus(pick(o,['status','order_status'],'')))).length:0;
  const lateOrders=(await safeRows('orders')).rows.filter(o=>{const st=normalizeStatus(pick(o,['status','order_status'],''));return !['delivered','cancelled'].includes(st)&&rowAgeMinutes(orderDateValue(o))>=45;}).length;
  return {...d,pendingStores,pendingDrivers,openSupport,activeOrders,lateOrders};
}
function actionCard(icon,title,count,description,page,systemTab=''){
  return `<button class="action-card ${count>0?'needs-action':''}" data-action-page="${page}" data-action-system-tab="${systemTab}"><span class="action-icon">${icon}</span><span><b>${title}</b><small>${description}</small></span><strong>${fmtNumber(count)}</strong><i>›</i></button>`;
}
function wireDashboardActionCards(){document.querySelectorAll('[data-action-page]').forEach(b=>b.addEventListener('click',()=>navigateAdminPage(b.dataset.actionPage,b.dataset.actionSystemTab||null)));}
function mobileAdminQuickActions(data){
  const securityUnread=(adminNotificationState.items||[]).filter(i=>isSecurityNotification(i)&&!i.read).length;
  return `<section class="mobile-admin-quick-actions" aria-label="إدارة سريعة للموبايل">
    <div class="mobile-quick-head"><div><span>وصول سريع</span><h3>المهام المهمة</h3></div><span class="mobile-quick-count">${fmtNumber(securityUnread)} تنبيه</span></div>
    <div class="mobile-quick-grid">
      <button type="button" data-mobile-admin-target="pin-customers"><span>🔐</span><b>PIN العملاء</b><small>طلبات الاسترجاع</small></button>
      <button type="button" data-mobile-admin-target="pin-partners"><span>🤝</span><b>PIN الشركاء</b><small>متجر وسائق</small></button>
      <button type="button" data-mobile-admin-page="stores"><span>🏪</span><b>تسجيل المتاجر</b><small>${fmtNumber(data?.pendingStores||0)} قيد المراجعة</small></button>
      <button type="button" data-mobile-admin-page="drivers"><span>🚚</span><b>تسجيل السائقين</b><small>${fmtNumber(data?.pendingDrivers||0)} قيد المراجعة</small></button>
    </div>
  </section>`;
}
function wireMobileAdminQuickActions(){
  document.querySelectorAll('[data-mobile-admin-target]').forEach(b=>b.addEventListener('click',()=>navigateAdminPage('system',b.dataset.mobileAdminTarget)));
  document.querySelectorAll('[data-mobile-admin-page]').forEach(b=>b.addEventListener('click',()=>navigateAdminPage(b.dataset.mobileAdminPage)));
}
async function renderStageTwoDashboard() {
  renderLoading();
  const d=await loadPolishDashboardData();
  const rows=d.recent.rows||[];
  const recentHtml=rows.length?rows.slice(0,6).map(row=>{const no=pick(row,['order_number','number','id']);const customer=pick(row,['customer_name','customer_full_name','user_name','name'],'عميل');const store=pick(row,['store_name','restaurant_name','partner_name'],'—');const status=statusLabel(pick(row,['status','order_status'],'—'));const amount=numericPick(row,['total_amount','grand_total','total','amount','final_total','order_total']);return `<tr><td>${escapeHtml(String(no).slice(0,18))}</td><td>${escapeHtml(customer)}</td><td>${escapeHtml(store)}</td><td><span class="status-pill">${escapeHtml(status)}</span></td><td>${amount?fmtMoney(amount):'—'}</td><td>${fmtDate(d.dateField?row[d.dateField]:orderDateValue(row))}</td></tr>`;}).join(''):`<tr><td colspan="6" class="muted-cell">لا توجد طلبات ظاهرة حاليًا.</td></tr>`;
  document.getElementById('content').innerHTML=`
    <section class="dashboard-hero polish-hero"><div><span class="pill">إدارة هلا طلب</span><h2>ملخص اليوم</h2><p>المهم أولًا: شنو صار اليوم وشنو يحتاج تدخل منك الآن.</p></div><button id="refreshDashboard" class="secondary-btn">↻ تحديث</button></section>
    ${mobileAdminQuickActions(d)}
    <section class="metrics-grid polish-metrics">
      ${metricCard('طلبات اليوم',d.todayOrders.ok?fmtNumber(d.todayOrders.count):'—','طلبات مسجلة اليوم','🧾')}
      ${metricCard('طلبات نشطة',fmtNumber(d.activeOrders),'لم تُسلّم أو تُلغَ بعد','📦')}
      ${metricCard('مبيعات اليوم',fmtMoney(d.revenue),'إجمالي قيمة طلبات اليوم','💰')}
      ${metricCard('المتاجر',d.stores.ok?fmtNumber(d.stores.count):'—','المتاجر المسجلة','🏪')}
      ${metricCard('السائقون',d.drivers.ok?fmtNumber(d.drivers.count):'—','سائقون ظهروا في الطلبات','🚚')}
    </section>
    <section class="action-center panel"><div class="panel-head"><div><span>الأولوية</span><h3>يحتاج إجراء منك</h3></div><span class="tag">${fmtNumber(d.pendingStores+d.pendingDrivers+d.openSupport+d.lateOrders)} تنبيه</span></div>
      <div class="action-grid">
        ${actionCard('🏪','متاجر تنتظر الموافقة',d.pendingStores,'راجع طلبات انضمام المتاجر','stores')}
        ${actionCard('🚚','سائقون ينتظرون المراجعة',d.pendingDrivers,'راجع حسابات ووثائق السائقين','drivers')}
        ${actionCard('⏱️','طلبات متأخرة',d.lateOrders,'طلبات نشطة مرّ عليها 45 دقيقة أو أكثر','orders')}
        ${actionCard('🎧','دعم يحتاج متابعة',d.openSupport,'محادثات دعم غير مغلقة','system','support')}
      </div>
    </section>
    <section class="dashboard-panels polish-panels"><article class="panel wide"><div class="panel-head"><div><span>آخر النشاط</span><h3>آخر الطلبات</h3></div><button class="link-btn" data-action-page="orders">عرض كل الطلبات</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>الطلب</th><th>العميل</th><th>المتجر</th><th>الحالة</th><th>الإجمالي</th><th>الوقت</th></tr></thead><tbody>${recentHtml}</tbody></table></div></article></section>`;
  document.getElementById('refreshDashboard')?.addEventListener('click',async()=>{await loadAdminNotifications();renderStageTwoDashboard();});
  wireDashboardActionCards(); wireMobileAdminQuickActions();
}

const ORDER_STATUS_OPTIONS = [
  ['pending','جديد'], ['accepted','مقبول'], ['assigned','تم تعيين سائق'], ['preparing','قيد التحضير'],
  ['ready','جاهز للاستلام'], ['picked_up','تم الاستلام'], ['delivered','تم التسليم'],
  ['cancelled','ملغي']
];

function normalizeStatus(value='') {
  const s = String(value || '').toLowerCase().trim();
  const aliases = {new:'pending',canceled:'cancelled',cancelled:'cancelled',driver_assigned:'assigned',assigned_to_driver:'assigned',in_preparation:'preparing',preparation:'preparing',ready_for_pickup:'ready',pickedup:'picked_up',completed:'delivered'};
  return aliases[s] || s;
}
function orderSearchText(row) {
  return Object.values(row || {}).filter(v => ['string','number'].includes(typeof v)).join(' ').toLowerCase();
}
function orderDisplayNo(row) { return pick(row,['order_number','number','id'],'—'); }
function orderStatusKey(row) { return normalizeStatus(pick(row,['status','order_status'],'')); }
function orderDateValue(row) {
  const field = detectDateField([row]);
  return field ? row[field] : pick(row,['created_at','placed_at','ordered_at','order_date','updated_at'],null);
}
function shortId(v) { const x=String(v||'—'); return x.length>14 ? `${x.slice(0,8)}…${x.slice(-4)}` : x; }
function statusOptionsHtml(current='') {
  const key = normalizeStatus(current);
  const known = new Set(ORDER_STATUS_OPTIONS.map(([v])=>v));
  const extra = key && !known.has(key) ? `<option value="${escapeHtml(key)}" selected>${escapeHtml(statusLabel(current))}</option>` : '';
  return extra + ORDER_STATUS_OPTIONS.map(([v,l])=>`<option value="${v}" ${v===key?'selected':''}>${l}</option>`).join('');
}

let ordersPageState = { rows:[], filtered:[], selected:null, dateField:null, statusField:'status', lookups:{stores:new Map(),profiles:new Map()} };

async function fetchLookupTable(table, fields='*') {
  try {
    const { data, error } = await supabase.from(table).select(fields).limit(5000);
    if (error) return { ok:false, rows:[], error:error.message };
    return { ok:true, rows:data || [] };
  } catch (e) { return { ok:false, rows:[], error:String(e) }; }
}

async function loadOrderLookups() {
  const [storesR, profilesR] = await Promise.all([
    fetchLookupTable('stores', 'id,name,phone'),
    fetchLookupTable('partner_profiles', 'id,full_name,phone,email,partner_type')
  ]);
  const stores = new Map((storesR.rows || []).map(r => [String(r.id), r]));
  const profiles = new Map((profilesR.rows || []).map(r => [String(r.id), r]));
  return { stores, profiles, storeLookupOk:storesR.ok, profileLookupOk:profilesR.ok };
}

function profileFor(id) { return id ? ordersPageState.lookups?.profiles?.get(String(id)) : null; }
function storeFor(id) { return id ? ordersPageState.lookups?.stores?.get(String(id)) : null; }
function customerLabel(row) {
  const p = profileFor(row.customer_id);
  return pick(row,['customer_name','customer_full_name'], pick(p,['full_name','email'],'عميل'));
}
function customerPhone(row) {
  const p = profileFor(row.customer_id);
  return pick(row,['customer_phone'], pick(p,['phone'],'غير متوفر'));
}
function storeLabel(row) {
  const s = storeFor(row.store_id);
  return pick(row,['store_name','restaurant_name'], pick(s,['name'], shortId(row.store_id)));
}
function driverLabel(row) {
  if (!row.driver_id) return 'غير مسند';
  const p = profileFor(row.driver_id);
  return pick(p,['full_name','email'], shortId(row.driver_id));
}
function paymentMethodLabel(v) { const s=String(v||'').toLowerCase(); return ({cash:'نقدًا',card:'بطاقة',online:'دفع إلكتروني'})[s] || v || 'غير محدد'; }
function paymentStatusLabel(v) { const s=String(v||'').toLowerCase(); return ({pending:'معلّق',paid:'مدفوع',failed:'فشل',refunded:'مسترجع'})[s] || v || 'غير محدد'; }

async function fetchOrdersForAdmin() {
  try {
    const { data, error } = await supabase.from('orders').select('*').limit(5000);
    if (error) return { ok:false, rows:[], error:error.message };
    const rows = data || [];
    const dateField = detectDateField(rows);
    if (dateField) rows.sort((a,b)=>new Date(b?.[dateField]||0)-new Date(a?.[dateField]||0));
    const statusField = rows.some(r => Object.prototype.hasOwnProperty.call(r,'status')) ? 'status' : (rows.some(r => Object.prototype.hasOwnProperty.call(r,'order_status')) ? 'order_status' : 'status');
    return { ok:true, rows, dateField, statusField };
  } catch (e) { return { ok:false, rows:[], error:String(e) }; }
}

function renderOrdersRows(rows) {
  if (!rows.length) return `<tr><td colspan="8" class="muted-cell">لا توجد طلبات مطابقة للبحث أو الفلتر.</td></tr>`;
  return rows.map(row => {
    const no = orderDisplayNo(row);
    const status = statusLabel(pick(row,['status','order_status'],'—'));
    const amount = numericPick(row,['total_amount','grand_total','total','amount','final_total','order_total','total_price']);
    const customer = customerLabel(row);
    const store = storeLabel(row);
    const driver = driverLabel(row);
    return `<tr data-order-id="${escapeHtml(String(row.id))}">
      <td><button class="link-btn order-open" data-id="${escapeHtml(row.id)}">${escapeHtml(String(no).slice(0,24))}</button></td>
      <td>${escapeHtml(String(customer))}</td>
      <td><strong class="primary-entity">${escapeHtml(String(store))}</strong></td>
      <td>${escapeHtml(String(driver))}</td>
      <td><span class="status-pill">${escapeHtml(status)}</span></td>
      <td>${amount ? fmtMoney(amount) : '—'}</td>
      <td>${fmtDate(orderDateValue(row))}</td>
      <td><button class="secondary-btn compact order-open" data-id="${escapeHtml(row.id)}">التفاصيل</button></td>
    </tr>`;
  }).join('');
}

function applyOrdersFilters() {
  const q = (document.getElementById('ordersSearch')?.value || '').trim().toLowerCase();
  const status = document.getElementById('ordersStatusFilter')?.value || 'all';
  const storeId = document.getElementById('ordersStoreFilter')?.value || 'all';
  const date = document.getElementById('ordersDateFilter')?.value || 'all';
  const now = new Date();
  let rows = [...ordersPageState.rows];
  if (q) rows = rows.filter(r => orderSearchText(r).includes(q));
  if (status !== 'all') rows = rows.filter(r => orderStatusKey(r) === status);
  if (storeId !== 'all') rows = rows.filter(r => String(r.store_id || '') === String(storeId));
  if (date !== 'all') rows = rows.filter(r => {
    const d = new Date(orderDateValue(r)); if (Number.isNaN(d.getTime())) return false;
    if (date === 'today') return d.toDateString() === now.toDateString();
    if (date === '7d') return (now - d) <= 7*86400000;
    if (date === '30d') return (now - d) <= 30*86400000;
    return true;
  });
  ordersPageState.filtered = rows;
  const body = document.getElementById('ordersTableBody');
  if (body) body.innerHTML = renderOrdersRows(rows);
  const count = document.getElementById('ordersResultCount'); if (count) count.textContent = `${fmtNumber(rows.length)} طلب`;
  wireOrderRowButtons();
}

function wireOrderRowButtons() {
  document.querySelectorAll('.order-open').forEach(btn => btn.addEventListener('click', () => {
    const row = ordersPageState.rows.find(r => String(r.id) === String(btn.dataset.id));
    if (row) openOrderDetails(row);
  }));
}

function detailItem(label,value,rawHtml=false) { return `<div class="detail-item"><span>${label}</span><b>${rawHtml?String(value ?? '—'):escapeHtml(String(value ?? '—'))}</b></div>`; }
function openOrderDetails(row) {
  ordersPageState.selected = row;
  const amount = numericPick(row,['total_amount','grand_total','total','amount','final_total','order_total','total_price']);
  const subtotal = numericPick(row,['subtotal','sub_total']);
  const deliveryFee = numericPick(row,['delivery_fee','shipping_fee']);
  const discount = numericPick(row,['discount_amount','discount']);
  const statusRaw = pick(row,['status','order_status'],'');
  const customer = customerLabel(row);
  const store = storeLabel(row);
  const driver = driverLabel(row);
  const address = pick(row,['delivery_address','address'],'غير متوفر');
  const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.id='orderModal';
  overlay.innerHTML = `<section class="modal-card">
    <div class="modal-head"><div><span class="pill">طلب ${escapeHtml(String(orderDisplayNo(row)).slice(0,24))}</span><h2>تفاصيل الطلب</h2><p class="modal-subtitle">بيانات تشغيلية واضحة للإدارة، مع إخفاء المعرفات التقنية داخل القسم المتقدم.</p></div><button class="icon-btn" id="closeOrderModal">✕</button></div>
    <div class="details-grid admin-order-details">
      ${detailItem('رقم الطلب', orderDisplayNo(row))}
      ${detailItem('الحالة الحالية', statusLabel(statusRaw))}
      ${detailItem('العميل', customer)}
      ${detailItem('هاتف العميل', customerPhone(row))}
      ${detailItem('المتجر', store)}
      ${detailItem('السائق', driver)}
      ${detailItem('الإجمالي', amount ? fmtMoney(amount) : '0 د.ع')}
      ${detailItem('المجموع قبل الإضافات', fmtMoney(subtotal))}
      ${detailItem('رسوم التوصيل', fmtMoney(deliveryFee))}
      ${detailItem('الخصم', fmtMoney(discount))}
      ${detailItem('طريقة الدفع', paymentMethodLabel(pick(row,['payment_method'],'')))}
      ${detailItem('حالة الدفع', paymentStatusLabel(pick(row,['payment_status'],'')))}
      ${detailItem('عنوان التوصيل', address)}
      ${detailItem('تاريخ الطلب', fmtDate(orderDateValue(row)))}
    </div>
    <div class="status-editor"><label>تحديث حالة الطلب<select id="orderStatusSelect">${statusOptionsHtml(statusRaw)}</select></label><button class="primary-btn compact" id="saveOrderStatus">حفظ الحالة</button></div>
    <div id="orderStatusMessage"></div>
    <details class="raw-details"><summary>البيانات التقنية / بقية حقول الطلب</summary><div class="raw-grid">${Object.entries(row).map(([k,v])=>detailItem(k, typeof v==='object'?JSON.stringify(v):v)).join('')}</div></details>
  </section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  document.getElementById('closeOrderModal').addEventListener('click',close);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) close(); });
  document.getElementById('saveOrderStatus').addEventListener('click',()=>updateOrderStatus(row));
}

async function updateOrderStatus(row) {
  const select = document.getElementById('orderStatusSelect'); const btn=document.getElementById('saveOrderStatus'); const box=document.getElementById('orderStatusMessage');
  const next = select.value; btn.disabled=true; btn.textContent='جارٍ الحفظ...'; box.innerHTML='';
  const field = ordersPageState.statusField || 'status';
  const { data, error } = await supabase.from('orders').update({ [field]: next }).eq('id', row.id).select().maybeSingle();
  btn.disabled=false; btn.textContent='حفظ الحالة';
  if (error) { box.innerHTML=`<div class="alert error">تعذر تحديث الحالة: ${escapeHtml(error.message)}. إذا لم تُشغّل SQL الخاص بـ Stage 3 فشغّله مرة واحدة.</div>`; return; }
  box.innerHTML='<div class="alert success">تم تحديث حالة الطلب بنجاح.</div>';
  const idx=ordersPageState.rows.findIndex(r=>String(r.id)===String(row.id)); if(idx>=0) ordersPageState.rows[idx]=data || {...row,[field]:next};
  ordersPageState.selected=data || {...row,[field]:next};
  applyOrdersFilters();
}

async function renderOrdersPage() {
  const content=document.getElementById('content');
  content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تحميل الطلبات...</h2><p>يتم تجهيز آخر بيانات الطلبات.</p></section>`;
  const r=await fetchOrdersForAdmin();
  if(!r.ok){ content.innerHTML=`<section class="empty-state"><div class="empty-icon">🧾</div><span class="pill">إدارة هلا طلب</span><h2>تعذر قراءة الطلبات</h2><p>${escapeHtml(r.error||'خطأ غير معروف')}</p><p>شغّل ملف <b>admin_stage3_rls.sql</b> في Supabase ثم أعد المحاولة.</p></section>`; return; }
  const lookups = await loadOrderLookups();
  ordersPageState={rows:r.rows,filtered:r.rows,selected:null,dateField:r.dateField,statusField:r.statusField,lookups};
  const statuses=[...new Set(r.rows.map(orderStatusKey).filter(Boolean))];
  const storeOptions=[...lookups.stores.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar')).map(s=>`<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name||'متجر')}</option>`).join('');
  content.innerHTML=`
    <section class="dashboard-hero"><div><span class="pill">إدارة يومية</span><h2>الطلبات</h2><p>كل طلبات هلا طلب في مكان واحد. استخدم الفلاتر للوصول بسرعة إلى طلبات متجر أو حالة أو فترة محددة.</p></div><button id="refreshOrders" class="secondary-btn">↻ تحديث الطلبات</button></section>
    <section class="orders-toolbar polish-toolbar">
      <label class="search-box">🔎<input id="ordersSearch" type="search" placeholder="ابحث برقم الطلب، اسم العميل أو السائق..." /></label>
      <label class="compact-filter"><span>المتجر</span><select id="ordersStoreFilter"><option value="all">كل المتاجر</option>${storeOptions}</select></label>
      <label class="compact-filter"><span>الحالة</span><select id="ordersStatusFilter"><option value="all">كل الحالات</option>${ORDER_STATUS_OPTIONS.filter(([v])=>statuses.includes(v)).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
      <label class="compact-filter"><span>الفترة</span><select id="ordersDateFilter"><option value="all">كل التواريخ</option><option value="today">اليوم</option><option value="7d">آخر 7 أيام</option><option value="30d">آخر 30 يومًا</option></select></label>
      <span id="ordersResultCount" class="tag">${fmtNumber(r.rows.length)} طلب</span>
    </section>
    <article class="panel orders-panel"><div class="table-wrap"><table class="data-table orders-table"><thead><tr><th>الطلب</th><th>العميل</th><th>المتجر</th><th>السائق</th><th>الحالة</th><th>الإجمالي</th><th>الوقت</th><th></th></tr></thead><tbody id="ordersTableBody">${renderOrdersRows(r.rows)}</tbody></table></div></article>`;
  ['ordersSearch','ordersStoreFilter','ordersStatusFilter','ordersDateFilter'].forEach(id=>document.getElementById(id)?.addEventListener(id==='ordersSearch'?'input':'change',applyOrdersFilters));
  document.getElementById('refreshOrders')?.addEventListener('click',renderOrdersPage);
  wireOrderRowButtons();
  if(pendingAdminNavigationTarget?.page==='orders' && pendingAdminNavigationTarget.id){
    const targetId=String(pendingAdminNavigationTarget.id);
    pendingAdminNavigationTarget=null;
    const target=ordersPageState.rows.find(x=>String(x.id)===targetId);
    if(target){
      const rowEl=document.querySelector(`[data-order-id="${CSS.escape(targetId)}"]`);
      rowEl?.classList.add('targeted-order-row');
      rowEl?.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>openOrderDetails(target),250);
    }
  }
}


// إدارة هلا طلب — Stores / restaurants
const STORE_REVIEW_OPTIONS = [
  ['pending','قيد المراجعة'], ['approved','مقبول'], ['rejected','مرفوض'], ['suspended','معلّق']
];
let storesPageState = { rows:[], filtered:[], reviews:new Map(), owners:new Map(), controls:new Map(), selected:null };

function storeReviewLabel(value='pending') {
  const s=String(value||'pending').toLowerCase();
  return ({pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض',suspended:'معلّق'})[s] || value || 'قيد المراجعة';
}
function storeReviewClass(value='pending') {
  const s=String(value||'pending').toLowerCase();
  return ['approved','rejected','suspended','pending'].includes(s) ? `review-${s}` : 'review-pending';
}
function storeOperationalStatus(row) {
  if (row?.is_active === false || row?.active === false || row?.enabled === false) return 'غير نشط';
  if (row?.is_open === true || row?.open === true) return 'مفتوح';
  if (row?.is_open === false || row?.open === false) return 'مغلق';
  const raw = pick(row,['status','account_status','store_status'],null);
  if (raw !== null && raw !== undefined && raw !== '') return String(raw);
  return 'غير محدد';
}
function storeOperationalClass(row){
  const status=storeOperationalStatus(row);
  if(status==='مفتوح') return 'operational-open';
  if(status==='مغلق' || status==='غير نشط') return 'operational-closed';
  return 'operational-neutral';
}
function ownerForStore(row) { return row?.owner_id ? storesPageState.owners.get(String(row.owner_id)) : null; }
function ownerNameForStore(row) { const o=ownerForStore(row); return pick(o,['full_name','email'], row?.owner_id ? shortId(row.owner_id) : 'غير متوفر'); }
function ownerPhoneForStore(row) { const o=ownerForStore(row); return pick(o,['phone'], 'غير متوفر'); }
function reviewForStore(row) { return storesPageState.reviews.get(String(row.id)) || { review_status:'pending', notes:'', reviewed_at:null }; }
function controlForStore(row) { return storesPageState.controls?.get(String(row.id)) || {store_id:row.id,lifecycle_status:'active',reason:''}; }
function storeLifecycleLabel(row){const v=String(controlForStore(row).lifecycle_status||'active');return ({active:'نشط',paused:'موقوف مؤقتًا',archived:'مؤرشف / مغلق نهائيًا'})[v]||v;}
function storeName(row) { return pick(row,['name','store_name','restaurant_name'],'متجر بدون اسم'); }
function storeCategory(row) { return pick(row,['category','type','store_type','business_type'],'غير محدد'); }
function storeAddress(row) { return pick(row,['address','store_address','location_text','delivery_address'],'غير متوفر'); }

async function fetchStoresAdmin() {
  try {
    const { data, error } = await supabase.from('stores').select('*').limit(5000);
    if (error) return {ok:false,rows:[],error:error.message};
    return {ok:true,rows:data||[]};
  } catch(e) { return {ok:false,rows:[],error:String(e)}; }
}
async function loadStoreAdminLookups() {
  const [ownersR,reviewsR,controlsR] = await Promise.all([
    fetchLookupTable('partner_profiles','id,full_name,phone,email,partner_type'),
    fetchLookupTable('admin_store_reviews','*'),
    fetchLookupTable('admin_store_controls','*')
  ]);
  return {
    owners:new Map((ownersR.rows||[]).map(r=>[String(r.id),r])),
    reviews:new Map((reviewsR.rows||[]).map(r=>[String(r.store_id),r])),
    controls:new Map((controlsR.rows||[]).map(r=>[String(r.store_id),r])),
    reviewTableOk:reviewsR.ok,
    reviewError:reviewsR.error||''
  };
}
function storeSearchText(row) {
  const review=reviewForStore(row), owner=ownerForStore(row)||{};
  return [...Object.values(row||{}),...Object.values(owner),...Object.values(review)]
    .filter(v=>['string','number','boolean'].includes(typeof v)).join(' ').toLowerCase();
}
function renderStoreRows(rows) {
  if (!rows.length) return `<tr><td colspan="6" class="muted-cell">لا توجد متاجر مطابقة للبحث أو الفلتر.</td></tr>`;
  return rows.map(row=>{
    const review=reviewForStore(row);
    return `<tr>
      <td><button class="link-btn store-open primary-entity" data-id="${escapeHtml(row.id)}">${escapeHtml(storeName(row))}</button><small class="table-subline">${escapeHtml(storeCategory(row))}</small></td>
      <td>${escapeHtml(ownerNameForStore(row))}</td>
      <td>${escapeHtml(String(pick(row,['phone'],'—')))}</td>
      <td><span class="operational-pill ${storeOperationalClass(row)}">${escapeHtml(storeOperationalStatus(row))}</span></td>
      <td><span class="review-pill ${storeReviewClass(review.review_status)}">${escapeHtml(storeReviewLabel(review.review_status))}</span></td>
      <td><button class="secondary-btn compact store-open" data-id="${escapeHtml(row.id)}">التفاصيل والمراجعة</button></td>
    </tr>`;
  }).join('');
}
function applyStoresFilters() {
  const q=(document.getElementById('storesSearch')?.value||'').trim().toLowerCase();
  const reviewStatus=document.getElementById('storesReviewFilter')?.value||'all';
  let rows=[...storesPageState.rows];
  if(q) rows=rows.filter(r=>storeSearchText(r).includes(q));
  if(reviewStatus!=='all') rows=rows.filter(r=>String(reviewForStore(r).review_status||'pending')===reviewStatus);
  storesPageState.filtered=rows;
  const body=document.getElementById('storesTableBody'); if(body) body.innerHTML=renderStoreRows(rows);
  const count=document.getElementById('storesResultCount'); if(count) count.textContent=`${fmtNumber(rows.length)} متجر`;
  wireStoreRowButtons();
  document.querySelectorAll('[data-metric-action="stores"]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.metricValue||'all';const sel=document.getElementById('storesReviewFilter');if(v==='rejected_or_suspended'){if(sel)sel.value='rejected';}else if(sel)sel.value=v;applyStoresFilters();document.querySelector('.stores-toolbar')?.scrollIntoView({behavior:'smooth',block:'start'});}));
}
function wireStoreRowButtons() {
  document.querySelectorAll('.store-open').forEach(btn=>btn.addEventListener('click',()=>{
    const row=storesPageState.rows.find(r=>String(r.id)===String(btn.dataset.id)); if(row) openStoreDetails(row);
  }));
}
function storeReviewOptionsHtml(current='pending') {
  return STORE_REVIEW_OPTIONS.map(([v,l])=>`<option value="${v}" ${v===String(current||'pending')?'selected':''}>${l}</option>`).join('');
}
function storeBooleanLabel(value) { return value===true?'نعم':value===false?'لا':'غير محدد'; }

// سجل العمليات يجب ألا يوقف الإجراء الرئيسي إذا تعذر حفظ السجل.
async function systemAudit(action,entityType,entityId,details={}) {
  try {
    const {data:{user}}=await supabase.auth.getUser();
    const payload={
      admin_id:user?.id||null,
      action:String(action||'admin_action'),
      entity_type:String(entityType||'unknown'),
      entity_id:entityId==null?null:String(entityId),
      details:details||{},
      created_at:new Date().toISOString()
    };
    const {error}=await supabase.from('admin_audit_log').insert(payload);
    if(error) console.warn('تعذر حفظ سجل العملية:',error.message);
  } catch (e) {
    console.warn('تعذر حفظ سجل العملية:',e);
  }
}
function storeActiveField(row){ return ['is_active','active','enabled'].find(k=>Object.prototype.hasOwnProperty.call(row||{},k))||null; }
function storeOpenField(row){ return ['is_open','open'].find(k=>Object.prototype.hasOwnProperty.call(row||{},k))||null; }
async function updateStoreOperationalField(row,field,value,actionLabel){
  const box=document.getElementById('storeOperationalMessage');
  if(!field){ if(box) box.innerHTML='<div class="alert warning">هذا المتجر لا يحتوي حقلًا يدعم هذا الإجراء حاليًا.</div>'; return false; }
  const reason=prompt(`سبب ${actionLabel} (اختياري):`,'') ?? '';
  if(!confirm(`${actionLabel} للمتجر "${storeName(row)}"؟`)) return false;
  if(box) box.innerHTML='<div class="alert">جارٍ تنفيذ الإجراء...</div>';
  const {error}=await supabase.from('stores').update({[field]:value}).eq('id',row.id);
  if(error){ if(box) box.innerHTML=`<div class="alert error">تعذر تنفيذ الإجراء: ${escapeHtml(error.message)}</div>`; return false; }
  row[field]=value;
  await systemAudit(actionLabel,'store',row.id,{field,value,reason});
  if(box) box.innerHTML=`<div class="alert success">تم ${escapeHtml(actionLabel)} بنجاح.</div>`;
  applyStoresFilters();
  return true;
}
async function setStoreLifecycle(row,next){
  const box=document.getElementById('storeOperationalMessage');
  const labels={active:'إعادة تفعيل المتجر',paused:'إيقاف المتجر مؤقتًا',archived:'أرشفة / إغلاق المتجر نهائيًا'};
  const label=labels[next]||'تحديث حالة المتجر';
  const reason=prompt(`سبب ${label}${next==='archived'?' (مطلوب)':' (اختياري)'}:`,'') ?? '';
  if(next==='archived' && !reason.trim()){if(box)box.innerHTML='<div class="alert warning">سبب الأرشفة مطلوب.</div>';return false;}
  if(!confirm(`${label} للمتجر "${storeName(row)}"؟`))return false;
  if(box)box.innerHTML='<div class="alert">جارٍ تنفيذ الإجراء...</div>';
  const {data,error}=await supabase.rpc('admin_set_store_lifecycle',{p_store_id:row.id,p_status:next,p_reason:reason});
  if(error){if(box)box.innerHTML=`<div class="alert error">${escapeHtml(error.message)}</div>`;return false;}
  storesPageState.controls.set(String(row.id),data||{store_id:row.id,lifecycle_status:next,reason});

  // اقرأ سجل المتجر من Supabase بعد الإجراء حتى لا تبقى الواجهة على قيمة is_active القديمة.
  const {data:freshStore,error:freshError}=await supabase.from('stores').select('*').eq('id',row.id).maybeSingle();
  if(!freshError && freshStore){
    Object.keys(row).forEach(k=>delete row[k]);
    Object.assign(row,freshStore);
    const idx=storesPageState.rows.findIndex(r=>String(r.id)===String(freshStore.id));
    if(idx>=0) storesPageState.rows[idx]=row;
  } else {
    const activeField=storeActiveField(row);
    if(activeField) row[activeField]=(next==='active');
    const openField=storeOpenField(row);
    if(openField && next!=='active') row[openField]=false;
  }

  await systemAudit(next==='archived'?'archive_store':next==='paused'?'pause_store':'reactivate_store','store',row.id,{reason,status:next});
  if(box)box.innerHTML=`<div class="alert success">تم ${escapeHtml(label)} بنجاح.</div>`;
  applyStoresFilters();
  return true;
}
async function hardDeleteStore(row){
  const box=document.getElementById('storeOperationalMessage');
  const typed=prompt(`اكتب اسم المتجر بالضبط للتأكيد:\n${storeName(row)}`,'') ?? '';
  if(typed.trim()!==String(storeName(row)).trim()){if(box)box.innerHTML='<div class="alert warning">تم إلغاء الحذف: الاسم غير مطابق.</div>';return false;}
  if(!confirm('تأكيد أخير: حذف المتجر نهائيًا؟'))return false;
  const {error}=await supabase.rpc('admin_hard_delete_store',{p_store_id:row.id});
  if(error){if(box)box.innerHTML=`<div class="alert error">${escapeHtml(error.message)}</div>`;return false;}
  await systemAudit('hard_delete_store','store',row.id,{store_name:storeName(row)});
  return true;
}
function wireStoreOperationalActions(row){
  document.querySelectorAll('[data-store-op]').forEach(btn=>btn.addEventListener('click',async()=>{
    const op=btn.dataset.storeOp;
    const activeField=storeActiveField(row), openField=storeOpenField(row);
    let ok=false;
    if(op==='activate') ok=await setStoreLifecycle(row,'active');
    else if(op==='pause') ok=await setStoreLifecycle(row,'paused');
    else if(op==='resume') ok=await setStoreLifecycle(row,'active');
    else if(op==='archive') ok=await setStoreLifecycle(row,'archived');
    else if(op==='restore_archive') ok=await setStoreLifecycle(row,'active');
    else if(op==='hard_delete'){ok=await hardDeleteStore(row);if(ok){document.getElementById('storeModal')?.remove();renderStoresPage();return;}}
    else if(op==='close') ok=await updateStoreOperationalField(row,openField,false,'إغلاق المتجر إداريًا');
    else if(op==='open') ok=await updateStoreOperationalField(row,openField,true,'فتح المتجر إداريًا');
    if(ok){
      document.getElementById('storeModal')?.remove();
      openStoreDetails(row);
      const msg=document.getElementById('storeOperationalMessage');
      if(msg) msg.innerHTML='<div class="alert success">تم تنفيذ الإجراء وتحديث حالة المتجر.</div>';
    }
  }));
}
function openStoreDetails(row) {
  storesPageState.selected=row;
  const owner=ownerForStore(row)||{}; const review=reviewForStore(row);
  const overlay=document.createElement('div'); overlay.className='modal-overlay'; overlay.id='storeModal';
  overlay.innerHTML=`<section class="modal-card store-modal-card">
    <div class="modal-head"><div><span class="pill">تفاصيل المتجر</span><h2>${escapeHtml(storeName(row))}</h2><p class="modal-subtitle">معلومات المتجر وحالة المراجعة والإجراء المطلوب من الإدارة.</p></div><button class="icon-btn" id="closeStoreModal">✕</button></div>
    <div class="store-review-banner ${storeReviewClass(review.review_status)}"><span>حالة المراجعة</span><strong>${escapeHtml(storeReviewLabel(review.review_status))}</strong><small>${review.reviewed_at?`آخر مراجعة: ${fmtDate(review.reviewed_at)}`:'لم تُراجع بعد'}</small></div>
    <div class="details-grid admin-store-details">
      ${detailItem('اسم المتجر',storeName(row))}
      ${detailItem('صاحب الحساب',ownerNameForStore(row))}
      ${detailItem('هاتف المتجر',pick(row,['phone'],'غير متوفر'))}
      ${detailItem('هاتف صاحب الحساب',ownerPhoneForStore(row))}
      ${detailItem('البريد',pick(owner,['email'],'غير متوفر'))}
      ${detailItem('النوع / التصنيف',storeCategory(row))}
      ${detailItem('الحالة التشغيلية',`<span class=\"operational-pill ${storeOperationalClass(row)}\">${escapeHtml(storeOperationalStatus(row))}</span>`,true)}
      ${detailItem('مفعّل',storeBooleanLabel(pick(row,['is_active','active','enabled'],null)))}
      ${detailItem('العنوان',storeAddress(row))}
      ${detailItem('الوصف',pick(row,['description','bio','about'],'غير متوفر'))}
    </div>
    <div class="store-operational-actions">
      <div class="panel-head"><div><span>إدارة التشغيل</span><h3>إجراءات المتجر</h3></div></div>
      <p class="panel-note">قرار المراجعة منفصل عن التشغيل. الإيقاف المؤقت قابل للرجوع، والأرشفة تحفظ تاريخ المتجر عند مغادرته المنصة.</p>
      <div class="details-grid compact-details">${detailItem('حالة المتجر الإدارية',storeLifecycleLabel(row))}</div>
      <div class="inline-actions wrap-actions">
        ${review.review_status==='approved' && pick(row,['is_active','active','enabled'],null)===false
          ? '<button type="button" class="primary-btn compact" data-store-op="activate">تفعيل المتجر</button>'
          : controlForStore(row).lifecycle_status==='archived'
            ? '<button type="button" class="primary-btn compact" data-store-op="restore_archive">إعادة فتح المتجر المؤرشف</button>'
            : controlForStore(row).lifecycle_status==='paused'
              ? '<button type="button" class="primary-btn compact" data-store-op="resume">إعادة تفعيل المتجر</button>'
              : '<button type="button" class="danger-btn compact" data-store-op="pause">إيقاف المتجر مؤقتًا</button>'}
        ${controlForStore(row).lifecycle_status==='active' && pick(row,['is_active','active','enabled'],null)!==false
          ? (pick(row,['is_open','open'],null)===false
              ? '<button type="button" class="primary-btn compact" data-store-op="open">فتح المتجر</button>'
              : '<button type="button" class="store-open-state-btn compact" data-store-op="close">● مفتوح</button>')
          : ''}
        ${pick(row,['is_active','active','enabled'],null)!==false && controlForStore(row).lifecycle_status==='active'
          ? '<span class="store-activated-badge">✓ المتجر مفعّل</span>' : ''}
        ${controlForStore(row).lifecycle_status!=='archived'?'<button type="button" class="danger-btn compact danger-outline" data-store-op="archive">أرشفة / إغلاق نهائي</button>':''}
      </div>
      <details class="danger-zone"><summary>منطقة خطرة: حذف نهائي</summary><p>يستخدم فقط للمدير الرئيسي، والنظام يرفض الحذف إذا للمتجر طلبات تاريخية.</p><button type="button" class="danger-btn compact" data-store-op="hard_delete">حذف المتجر نهائيًا</button></details>
      <div id="storeOperationalMessage"></div>
    </div>
    <div class="review-editor">
      <label>قرار المراجعة<select id="storeReviewStatus">${storeReviewOptionsHtml(review.review_status)}</select></label>
      <label>ملاحظات الإدارة<textarea id="storeReviewNotes" rows="3" placeholder="ملاحظة اختيارية للإدارة...">${escapeHtml(review.notes||'')}</textarea></label>
      <button class="primary-btn compact" id="saveStoreReview">حفظ المراجعة</button>
    </div>
    <div id="storeReviewMessage"></div>
    <details class="raw-details"><summary>البيانات التقنية / بقية حقول المتجر</summary><div class="raw-grid">${Object.entries(row).map(([k,v])=>detailItem(k,typeof v==='object'?JSON.stringify(v):v)).join('')}</div></details>
  </section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove(); document.getElementById('closeStoreModal').addEventListener('click',close); overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.getElementById('saveStoreReview').addEventListener('click',()=>saveStoreReview(row));
  wireStoreOperationalActions(row);
}
async function saveStoreReview(row) {
  const status=document.getElementById('storeReviewStatus')?.value||'pending';
  const notes=document.getElementById('storeReviewNotes')?.value?.trim()||'';
  const btn=document.getElementById('saveStoreReview'), box=document.getElementById('storeReviewMessage');
  btn.disabled=true; btn.textContent='جارٍ الحفظ...'; box.innerHTML='';
  const { data:{user} } = await supabase.auth.getUser();
  const payload={store_id:row.id,review_status:status,notes,reviewed_by:user?.id||null,reviewed_at:new Date().toISOString()};
  const {data,error}=await supabase.from('admin_store_reviews').upsert(payload,{onConflict:'store_id'}).select().maybeSingle();
  btn.disabled=false; btn.textContent='حفظ المراجعة';
  if(error){box.innerHTML=`<div class="alert error">تعذر حفظ المراجعة: ${escapeHtml(error.message)}. شغّل ملف admin_stage4_rls.sql مرة واحدة.</div>`;return;}
  storesPageState.reviews.set(String(row.id),data||payload); box.innerHTML=`<div class="alert success">تم حفظ مراجعة المتجر بنجاح.${status==='approved'?' يمكنك الآن تفعيل المتجر من قسم إجراءات المتجر.':''}</div>`; applyStoresFilters();
}
async function renderStoresPage() {
  const content=document.getElementById('content');
  content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تحميل المتاجر...</h2><p>يتم قراءة جدول stores ومراجعات الإدارة من Supabase.</p></section>`;
  const [storesR,lookups]=await Promise.all([fetchStoresAdmin(),loadStoreAdminLookups()]);
  if(!storesR.ok){content.innerHTML=`<section class="empty-state"><div class="empty-icon">🏪</div><span class="pill">إدارة هلا طلب</span><h2>تعذر قراءة المتاجر</h2><p>${escapeHtml(storesR.error||'خطأ غير معروف')}</p><p>شغّل ملف <b>admin_stage4_rls.sql</b> ثم أعد المحاولة.</p></section>`;return;}
  storesPageState={rows:storesR.rows,filtered:storesR.rows,reviews:lookups.reviews,owners:lookups.owners,controls:lookups.controls||new Map(),selected:null};
  const counts={pending:0,approved:0,rejected:0,suspended:0}; storesR.rows.forEach(r=>{const s=reviewForStore(r).review_status||'pending'; if(counts[s]!==undefined)counts[s]++;});
  content.innerHTML=`
    <section class="dashboard-hero"><div><span class="pill">إدارة هلا طلب</span><h2>إدارة المتاجر / المطاعم</h2><p>تابع المتاجر، حالتها التشغيلية وقرارات المراجعة من مكان واحد.</p></div><button id="refreshStores" class="secondary-btn">↻ تحديث المتاجر</button></section>
    <section class="store-summary-grid">
      ${actionMetricCard('إجمالي المتاجر',fmtNumber(storesR.rows.length),'كل المتاجر المسجلة','🏪','stores','all')}
      ${actionMetricCard('قيد المراجعة',fmtNumber(counts.pending),'لم يُتخذ قرار إداري بعد','🕒','stores','pending')}
      ${actionMetricCard('مقبولة',fmtNumber(counts.approved),'مراجعات إدارية مكتملة','✅','stores','approved')}
      ${actionMetricCard('مرفوضة / معلقة',fmtNumber(counts.rejected+counts.suspended),'قرارات تحتاج متابعة','⛔','stores','rejected_or_suspended')}
    </section>
    <section class="stores-toolbar">
      <label class="search-box">🔎<input id="storesSearch" type="search" placeholder="ابحث باسم المتجر، الهاتف، صاحب الحساب، النوع..." /></label>
      <select id="storesReviewFilter"><option value="all">كل حالات المراجعة</option>${STORE_REVIEW_OPTIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
      <span id="storesResultCount" class="tag">${fmtNumber(storesR.rows.length)} متجر</span>
    </section>
    <article class="panel stores-panel"><div class="table-wrap"><table class="data-table stores-table"><thead><tr><th>المتجر</th><th>صاحب الحساب</th><th>الهاتف</th><th>التشغيل</th><th>المراجعة</th><th></th></tr></thead><tbody id="storesTableBody">${renderStoreRows(storesR.rows)}</tbody></table></div></article>`;
  document.getElementById('refreshStores')?.addEventListener('click',renderStoresPage);
  document.getElementById('storesSearch')?.addEventListener('input',applyStoresFilters);
  document.getElementById('storesReviewFilter')?.addEventListener('change',applyStoresFilters);
  wireStoreRowButtons();
  consumePendingAdminTarget('stores');
}


// إدارة هلا طلب — Drivers / documents / administrative review
const DRIVER_REVIEW_OPTIONS=[['pending','قيد المراجعة'],['approved','مقبول'],['rejected','مرفوض'],['suspended','معلّق']];
let driversPageState={rows:[],filtered:[],reviews:new Map(),profiles:new Map(),controls:new Map(),documents:[],orders:[],assignments:new Map(),stores:new Map()};

async function fetchAdminRows(table, orderField='created_at') {
  try {
    let r=await supabase.from(table).select('*').order(orderField,{ascending:false});
    if(r.error && /column|does not exist/i.test(r.error.message||'')) r=await supabase.from(table).select('*');
    if(r.error) return {ok:false,rows:[],error:r.error.message};
    return {ok:true,rows:r.data||[]};
  } catch(e){return {ok:false,rows:[],error:String(e)}}
}
function driverReviewFor(id){return driversPageState.reviews.get(String(id))||{driver_id:id,review_status:'pending',notes:'',reviewed_at:null};}
function driverReviewLabel(v){return Object.fromEntries(DRIVER_REVIEW_OPTIONS)[String(v||'pending')]||String(v||'pending');}
function driverReviewClass(v){return `review-${['approved','rejected','suspended'].includes(String(v))?v:'pending'}`;}
function driverReviewOptionsHtml(current){return DRIVER_REVIEW_OPTIONS.map(([v,l])=>`<option value="${v}" ${v===String(current||'pending')?'selected':''}>${l}</option>`).join('');}
function profileForDriver(id){return driversPageState.profiles.get(String(id))||{};}
function driverName(row){const p=profileForDriver(row.id);return pick(p,['full_name','name','display_name'],row.email||'سائق');}
function driverPhone(row){const p=profileForDriver(row.id);return pick(p,['phone','mobile'],'غير متوفر');}
function driverEmail(row){const p=profileForDriver(row.id);return pick(p,['email'],row.email||'غير متوفر');}
function docsForDriver(id){return driversPageState.documents.filter(d=>String(d.driver_id)===String(id));}
function driverAssignmentFor(id){return driversPageState.assignments.get(String(id))||{driver_id:id,driver_type:'store',store_id:null,is_active:true};}
function driverTypeLabel(v){return String(v)==='hala'?'سائق هلا طلب':'تابع لمتجر';}
function driverStoreName(id){if(!id)return 'غير معيّن';return pick(driversPageState.stores.get(String(id))||{},['name'],'متجر غير معروف');}
function driverStoreOptionsHtml(current){const rows=[...driversPageState.stores.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'));return `<option value="">اختر المتجر...</option>`+rows.map(x=>`<option value="${escapeHtml(String(x.id))}" ${String(x.id)===String(current||'')?'selected':''}>${escapeHtml(pick(x,['name'],'متجر'))}</option>`).join('');}
function documentStatusLabel(v){const m={pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض'};return m[String(v||'pending')]||String(v||'pending');}
function buildDriverRows(orders,profiles,reviews,documents){
  const map=new Map();
  for(const o of orders||[]){if(!o.driver_id) continue; const k=String(o.driver_id); const cur=map.get(k)||{id:o.driver_id,deliveries:0,last_order_at:null,last_order_number:null}; cur.deliveries++; const dt=pick(o,['created_at','accepted_at','ready_at','delivered_at'],null); if(dt && (!cur.last_order_at || new Date(dt)>new Date(cur.last_order_at))){cur.last_order_at=dt;cur.last_order_number=pick(o,['order_number'],'—');} map.set(k,cur);}
  for(const p of profiles||[]){const type=String(p.partner_type||'').toLowerCase(); if(type==='driver' || map.has(String(p.id))) {const k=String(p.id);if(!map.has(k))map.set(k,{id:p.id,deliveries:0,last_order_at:null,last_order_number:null});}}
  for(const r of reviews||[]){const k=String(r.driver_id);if(k && !map.has(k))map.set(k,{id:r.driver_id,deliveries:0,last_order_at:null,last_order_number:null});}
  for(const d of documents||[]){const k=String(d.driver_id);if(k && !map.has(k))map.set(k,{id:d.driver_id,deliveries:0,last_order_at:null,last_order_number:null});}
  return [...map.values()];
}
async function loadDriversAdminData(){
  const [ordersR,profilesR,reviewsR,docsR,controlsR,assignmentsR,storesR]=await Promise.all([
    fetchAdminRows('orders'),fetchAdminRows('partner_profiles'),fetchAdminRows('admin_driver_reviews','reviewed_at'),fetchAdminRows('admin_driver_documents','created_at'),fetchAdminRows('admin_user_controls','updated_at'),fetchAdminRows('driver_delivery_scope','updated_at'),fetchAdminRows('stores','created_at')
  ]);
  if(!ordersR.ok) return {ok:false,error:ordersR.error};
  const profiles=profilesR.ok?profilesR.rows:[]; const reviews=reviewsR.ok?reviewsR.rows:[]; const docs=docsR.ok?docsR.rows:[];
  return {ok:true,orders:ordersR.rows,profiles,reviews,controls:controlsR.ok?controlsR.rows:[],documents:docs,assignments:assignmentsR.ok?assignmentsR.rows:[],stores:storesR.ok?storesR.rows:[],rows:buildDriverRows(ordersR.rows,profiles,reviews,docs)};
}
function renderDriverRows(rows){
  if(!rows.length)return `<tr><td colspan="8" class="muted-cell">لا يوجد سائقون مطابقون.</td></tr>`;
  return rows.map(r=>{const review=driverReviewFor(r.id);const control=driverControlFor(r.id);const docs=docsForDriver(r.id);const a=driverAssignmentFor(r.id);return `<tr>
    <td><b class="primary-entity">${escapeHtml(driverName(r))}</b><small class="table-subline">${escapeHtml(driverPhone(r))}</small></td>
    <td><b>${escapeHtml(driverTypeLabel(a.driver_type))}</b><small class="table-subline">${escapeHtml(a.driver_type==='hala'?'جميع المتاجر':driverStoreName(a.store_id))}</small></td>
    <td>${fmtNumber(r.deliveries)}</td>
    <td>${fmtNumber(docs.length)}</td>
    <td>${r.last_order_at?fmtDate(r.last_order_at):'—'}</td>
    <td><span class="review-pill ${driverAccessClass(control.access_status)}">${escapeHtml(driverAccessLabel(control.access_status))}</span></td>
    <td><span class="review-pill ${driverReviewClass(review.review_status)}">${escapeHtml(driverReviewLabel(review.review_status))}</span></td>
    <td><button class="secondary-btn compact driver-details-btn" data-driver-id="${escapeHtml(String(r.id))}">التفاصيل والمراجعة</button></td>
  </tr>`}).join('');
}
function applyDriversFilters(){
  const q=(document.getElementById('driversSearch')?.value||'').trim().toLowerCase();
  const f=document.getElementById('driversReviewFilter')?.value||'all';
  const a=document.getElementById('driversAccessFilter')?.value||'all';
  driversPageState.filtered=driversPageState.rows.filter(r=>{const review=driverReviewFor(r.id);const control=driverControlFor(r.id);const hay=[driverName(r),driverPhone(r),driverEmail(r),r.id].join(' ').toLowerCase();return (!q||hay.includes(q))&&(f==='all'||review.review_status===f)&&(a==='all'||String(control.access_status||'active')===a);});
  const body=document.getElementById('driversTableBody');if(body)body.innerHTML=renderDriverRows(driversPageState.filtered);const c=document.getElementById('driversResultCount');if(c)c.textContent=`${fmtNumber(driversPageState.filtered.length)} سائق`;wireDriverRowButtons();
}
function wireDriverRowButtons(){document.querySelectorAll('.driver-details-btn').forEach(b=>b.addEventListener('click',()=>{const row=driversPageState.rows.find(r=>String(r.id)===String(b.dataset.driverId));if(row)openDriverDetails(row);}));}
function renderDriverDocs(id){const docs=docsForDriver(id);if(!docs.length)return `<div class="driver-doc-empty">لا توجد مستندات مسجلة لهذا السائق حاليًا.</div>`;return `<div class="driver-doc-list">${docs.map(d=>`<div class="driver-doc-row"><div><strong>${escapeHtml(pick(d,['document_type'],'مستند'))}</strong><span>${escapeHtml(pick(d,['document_number'],'بدون رقم'))}</span></div><div><span class="review-pill ${driverReviewClass(d.review_status==='approved'?'approved':d.review_status==='rejected'?'rejected':'pending')}">${escapeHtml(documentStatusLabel(d.review_status))}</span>${d.file_url?`<a class="link-btn" href="${escapeHtml(d.file_url)}" target="_blank" rel="noopener">فتح المستند</a>`:''}</div></div>`).join('')}</div>`;}
function driverControlFor(id){return driversPageState.controls.get(String(id))||{user_id:id,access_status:'active',notes:''};}
function driverAccessLabel(v='active'){return ({active:'نشط',monitor:'تحت المتابعة',suspended:'موقوف مؤقتًا',blocked:'موقوف نهائيًا'})[String(v||'active')]||String(v||'نشط');}
function driverAccessClass(v='active'){const x=String(v||'active');return x==='active'?'review-approved':x==='blocked'?'review-rejected':x==='suspended'?'review-rejected':'review-pending';}
async function setDriverOperationalStatus(row,next){
  const box=document.getElementById('driverOperationalMessage');
  const labels={suspended:'إيقاف السائق مؤقتًا',blocked:'إيقاف السائق نهائيًا',active:'إعادة تفعيل السائق'};
  const label=labels[next]||'تحديث حالة السائق';
  const permanent=next==='blocked';
  const reason=prompt(`سبب ${label}${permanent?' (مطلوب)':' (اختياري)'}:`,'') ?? '';
  if(permanent && !reason.trim()){if(box)box.innerHTML='<div class="alert warning">سبب الإيقاف النهائي مطلوب.</div>';return false;}
  if(permanent && !confirm(`تحذير: سيتم إيقاف السائق "${driverName(row)}" نهائيًا. هل تريد المتابعة؟`))return false;
  if(!permanent && !confirm(`${label} للسائق "${driverName(row)}"؟`))return false;
  if(box)box.innerHTML='<div class="alert">جارٍ تنفيذ الإجراء...</div>';
  const {data,error}=await supabase.rpc('admin_set_driver_access',{p_driver_id:row.id,p_status:next,p_reason:reason});
  if(error){if(box)box.innerHTML=`<div class="alert error">تعذر تحديث حالة السائق: ${escapeHtml(error.message)}</div>`;return false;}
  driversPageState.controls.set(String(row.id),data||{user_id:row.id,access_status:next,notes:reason,updated_at:new Date().toISOString()});
  await systemAudit(next==='blocked'?'block_driver':next==='suspended'?'suspend_driver':'reactivate_driver','driver',row.id,{reason});
  if(box)box.innerHTML=`<div class="alert success">تم ${escapeHtml(label)} بنجاح.</div>`;
  return true;
}
async function saveDriverAssignment(row){
  const box=document.getElementById('driverAssignmentMessage'),btn=document.getElementById('saveDriverAssignment');
  const driverType=document.getElementById('driverDeliveryType')?.value||'store';
  const storeId=document.getElementById('driverAssignedStore')?.value||'';
  if(driverType==='store'&&!storeId){if(box)box.innerHTML='<div class="alert warning">اختر متجرًا للسائق قبل الحفظ.</div>';return;}
  if(btn){btn.disabled=true;btn.textContent='جارٍ الحفظ...';}
  const {data,error}=await supabase.rpc('admin_set_driver_delivery_scope',{p_driver_id:row.id,p_driver_type:driverType,p_store_id:driverType==='store'?storeId:null});
  if(btn){btn.disabled=false;btn.textContent='حفظ ربط السائق';}
  if(error){if(box)box.innerHTML=`<div class="alert error">تعذر حفظ ربط السائق: ${escapeHtml(error.message)}. شغّل ملف admin_stage22_driver_store_assignment.sql مرة واحدة.</div>`;return;}
  const saved=(Array.isArray(data)?data[0]:data)||{driver_id:row.id,driver_type:driverType,store_id:driverType==='store'?storeId:null,is_active:true};
  driversPageState.assignments.set(String(row.id),saved);
  if(box)box.innerHTML=`<div class="alert success">تم الحفظ: ${escapeHtml(driverTypeLabel(driverType))}${driverType==='store'?` — ${escapeHtml(driverStoreName(storeId))}`:''}.</div>`;
  applyDriversFilters();
}
function wireDriverAssignmentType(){const type=document.getElementById('driverDeliveryType'),wrap=document.getElementById('driverStoreSelectWrap');if(!type||!wrap)return;const sync=()=>{wrap.hidden=type.value!=='store';};type.addEventListener('change',sync);sync();}
function openDriverDetails(row){
  const p=profileForDriver(row.id),review=driverReviewFor(row.id),docs=docsForDriver(row.id),control=driverControlFor(row.id); const overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='driverModal';
  overlay.innerHTML=`<section class="modal-card driver-modal-card"><div class="modal-head"><div><span class="pill">تفاصيل السائق</span><h2>${escapeHtml(driverName(row))}</h2><p class="modal-subtitle">معلومات السائق، نشاطه، مستنداته وحالة المراجعة في مكان واحد.</p></div><button class="icon-btn" id="closeDriverModal">✕</button></div>
    <div class="store-review-banner ${driverReviewClass(review.review_status)}"><span>حالة المراجعة</span><strong>${escapeHtml(driverReviewLabel(review.review_status))}</strong><small>${review.reviewed_at?`آخر مراجعة: ${fmtDate(review.reviewed_at)}`:'لم تُراجع بعد'}</small></div>
    <div class="details-grid admin-driver-details">${detailItem('اسم السائق',driverName(row))}${detailItem('الهاتف',driverPhone(row))}${detailItem('البريد',driverEmail(row))}${detailItem('طلبات ظهر بها',fmtNumber(row.deliveries))}${detailItem('آخر نشاط',row.last_order_at?fmtDate(row.last_order_at):'غير متوفر')}${detailItem('نوع الحساب',pick(p,['partner_type'],'غير محدد'))}${detailItem('عدد المستندات',fmtNumber(docs.length))}</div>
    <section class="driver-doc-section"><div class="panel-head"><div><span>توزيع التوصيل</span><h3>ربط السائق بالمتجر</h3></div><span class="tag">${escapeHtml(driverTypeLabel(driverAssignmentFor(row.id).driver_type))}</span></div><p class="panel-note">يمكن ربط أكثر من سائق بنفس المتجر. السائق التابع لمتجر لن يرى أو يستلم طلبات متجر آخر.</p><div class="review-editor driver-review-editor"><label>نوع السائق<select id="driverDeliveryType"><option value="store" ${driverAssignmentFor(row.id).driver_type!=='hala'?'selected':''}>تابع لمتجر</option><option value="hala" ${driverAssignmentFor(row.id).driver_type==='hala'?'selected':''}>سائق هلا طلب — كل المتاجر</option></select></label><label id="driverStoreSelectWrap">المتجر المرتبط<select id="driverAssignedStore">${driverStoreOptionsHtml(driverAssignmentFor(row.id).store_id)}</select></label><button class="primary-btn compact" id="saveDriverAssignment">حفظ ربط السائق</button></div><div id="driverAssignmentMessage"></div></section>
    <section class="driver-doc-section"><div class="panel-head"><div><span>الوثائق</span><h3>مستندات السائق</h3></div><span class="tag">${fmtNumber(docs.length)} مستند</span></div>${renderDriverDocs(row.id)}</section>
    <div class="store-operational-actions"><div class="panel-head"><div><span>إدارة التشغيل</span><h3>حالة حساب السائق</h3></div><span class="tag">${control.access_status==='blocked'?'موقوف نهائيًا':control.access_status==='suspended'?'موقوف مؤقتًا':'نشط'}</span></div><p class="panel-note">الإيقاف المؤقت قابل للرجوع. الإيقاف النهائي يحظر السائق من العمل لكنه يبقى ظاهرًا في السجل الإداري لحفظ تاريخ الطلبات.</p><div class="inline-actions wrap-actions">${control.access_status==='blocked'?'<button type="button" class="primary-btn compact" id="reactivateDriver">إعادة فتح الحساب</button>':control.access_status==='suspended'?'<button type="button" class="primary-btn compact" id="reactivateDriver">إعادة تفعيل السائق</button><button type="button" class="danger-btn compact danger-outline" id="blockDriver">إيقاف نهائي (يبقى بالسجل)</button>':'<button type="button" class="danger-btn compact" id="suspendDriver">إيقاف السائق مؤقتًا</button><button type="button" class="danger-btn compact danger-outline" id="blockDriver">إيقاف نهائي (يبقى بالسجل)</button>'}</div><div id="driverOperationalMessage"></div></div>
    <div class="review-editor driver-review-editor"><label>قرار المراجعة<select id="driverReviewStatus">${driverReviewOptionsHtml(review.review_status)}</select></label><label>ملاحظات الإدارة<textarea id="driverReviewNotes" rows="3" placeholder="ملاحظة اختيارية للإدارة...">${escapeHtml(review.notes||'')}</textarea></label><button class="primary-btn compact" id="saveDriverReview">حفظ المراجعة</button></div><div id="driverReviewMessage"></div>
    <details class="raw-details"><summary>بيانات الملف التقنية</summary><div class="raw-grid">${Object.entries(p).map(([k,v])=>detailItem(k,typeof v==='object'?JSON.stringify(v):v)).join('')||'<div class="muted-cell">لا توجد بيانات إضافية.</div>'}</div></details>
  </section>`;
  document.body.appendChild(overlay);const close=()=>overlay.remove();document.getElementById('closeDriverModal').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});document.getElementById('saveDriverReview').addEventListener('click',()=>saveDriverReview(row));document.getElementById('saveDriverAssignment')?.addEventListener('click',()=>saveDriverAssignment(row));wireDriverAssignmentType();
  document.getElementById('suspendDriver')?.addEventListener('click',async()=>{if(await setDriverOperationalStatus(row,'suspended')){overlay.remove();openDriverDetails(row);}});
  document.getElementById('blockDriver')?.addEventListener('click',async()=>{if(await setDriverOperationalStatus(row,'blocked')){overlay.remove();openDriverDetails(row);}});
  document.getElementById('reactivateDriver')?.addEventListener('click',async()=>{if(await setDriverOperationalStatus(row,'active')){overlay.remove();openDriverDetails(row);}});
}
async function saveDriverReview(row){const status=document.getElementById('driverReviewStatus')?.value||'pending';const notes=document.getElementById('driverReviewNotes')?.value?.trim()||'';const btn=document.getElementById('saveDriverReview'),box=document.getElementById('driverReviewMessage');btn.disabled=true;btn.textContent='جارٍ الحفظ...';box.innerHTML='';const {data:{user}}=await supabase.auth.getUser();const payload={driver_id:row.id,review_status:status,notes,reviewed_by:user?.id||null,reviewed_at:new Date().toISOString()};const {data,error}=await supabase.from('admin_driver_reviews').upsert(payload,{onConflict:'driver_id'}).select().maybeSingle();btn.disabled=false;btn.textContent='حفظ المراجعة';if(error){box.innerHTML=`<div class="alert error">تعذر حفظ المراجعة: ${escapeHtml(error.message)}. شغّل ملف admin_stage5_rls.sql مرة واحدة.</div>`;return;}driversPageState.reviews.set(String(row.id),data||payload);box.innerHTML='<div class="alert success">تم حفظ مراجعة السائق بنجاح.</div>';applyDriversFilters();}
async function renderDriversPage(){const content=document.getElementById('content');content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تحميل السائقين...</h2><p>يتم تجهيز السائقين وحالات المراجعة.</p></section>`;const d=await loadDriversAdminData();if(!d.ok){content.innerHTML=`<section class="empty-state"><div class="empty-icon">🚚</div><span class="pill">إدارة هلا طلب</span><h2>تعذر قراءة بيانات السائقين</h2><p>${escapeHtml(d.error||'خطأ غير معروف')}</p><p>شغّل ملف <b>admin_stage5_rls.sql</b> ثم أعد المحاولة.</p></section>`;return;}driversPageState.rows=d.rows;driversPageState.filtered=d.rows;driversPageState.orders=d.orders;driversPageState.profiles=new Map(d.profiles.map(p=>[String(p.id),p]));driversPageState.reviews=new Map(d.reviews.map(r=>[String(r.driver_id),r]));driversPageState.controls=new Map((d.controls||[]).map(r=>[String(r.user_id),r]));driversPageState.documents=d.documents;driversPageState.assignments=new Map((d.assignments||[]).map(r=>[String(r.driver_id),r]));driversPageState.stores=new Map((d.stores||[]).map(r=>[String(r.id),r]));
  const reviewCounts={pending:0,approved:0,rejected:0,suspended:0};const accessCounts={active:0,suspended:0,blocked:0,monitor:0};d.rows.forEach(r=>{const rv=driverReviewFor(r.id).review_status||'pending';if(reviewCounts[rv]!==undefined)reviewCounts[rv]++;const av=String(driverControlFor(r.id).access_status||'active');if(accessCounts[av]!==undefined)accessCounts[av]++;});
  content.innerHTML=`<section class="dashboard-hero"><div><span class="pill">إدارة يومية</span><h2>السائقون</h2><p>تابع السائقين، آخر نشاط، عدد التوصيلات، المستندات وحالة المراجعة من شاشة واحدة واضحة.</p></div><button id="refreshDrivers" class="secondary-btn">↻ تحديث السائقين</button></section>
  <section class="store-summary-grid">${actionMetricCard('إجمالي السائقين',fmtNumber(d.rows.length),'كل حسابات السائقين','🚚','drivers-access','all')}${actionMetricCard('نشطون',fmtNumber(accessCounts.active),'مسموح لهم باستلام الطلبات','✅','drivers-access','active')}${actionMetricCard('موقوفون مؤقتًا',fmtNumber(accessCounts.suspended),'موقوفون إداريًا وقابلون للإرجاع','⏸️','drivers-access','suspended')}${actionMetricCard('موقوفون نهائيًا',fmtNumber(accessCounts.blocked),'محظورون من التشغيل حتى إعادة فتحهم','⛔','drivers-access','blocked')}</section>
  <section class="stores-toolbar"><label class="search-box">🔎<input id="driversSearch" type="search" placeholder="ابحث باسم السائق، الهاتف، البريد..." /></label><select id="driversReviewFilter"><option value="all">كل حالات المراجعة</option>${DRIVER_REVIEW_OPTIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><select id="driversAccessFilter"><option value="all">كل حالات الحساب</option><option value="active">نشط</option><option value="suspended">موقوف مؤقتًا</option><option value="blocked">موقوف نهائيًا</option><option value="monitor">تحت المتابعة</option></select><span id="driversResultCount" class="tag">${fmtNumber(d.rows.length)} سائق</span></section>
  <article class="panel stores-panel"><div class="table-wrap"><table class="data-table drivers-table"><thead><tr><th>السائق</th><th>نوع التوصيل / المتجر</th><th>الطلبات</th><th>الوثائق</th><th>آخر نشاط</th><th>حالة الحساب</th><th>المراجعة</th><th></th></tr></thead><tbody id="driversTableBody">${renderDriverRows(d.rows)}</tbody></table></div></article>`;
  document.getElementById('refreshDrivers')?.addEventListener('click',renderDriversPage);document.getElementById('driversSearch')?.addEventListener('input',applyDriversFilters);document.getElementById('driversReviewFilter')?.addEventListener('change',applyDriversFilters);document.getElementById('driversAccessFilter')?.addEventListener('change',applyDriversFilters);document.querySelectorAll('[data-metric-action="drivers-access"]').forEach(b=>b.addEventListener('click',()=>{const sel=document.getElementById('driversAccessFilter');if(sel)sel.value=b.dataset.metricValue||'all';applyDriversFilters();document.querySelector('.stores-toolbar')?.scrollIntoView({behavior:'smooth',block:'start'});}));wireDriverRowButtons();consumePendingAdminTarget('drivers');}


// إدارة هلا طلب — Users & basic permissions
const USER_ACCESS_OPTIONS = [
  ['active','نشط'], ['monitor','تحت المتابعة'], ['suspended','معلّق إداريًا']
];
let usersPageState = { rows:[], filtered:[], selected:null, currentUserId:null };

function userTypeLabel(v='customer') {
  const s=String(v||'customer').toLowerCase();
  return ({admin:'مدير',store_owner:'صاحب متجر',driver:'سائق',customer:'عميل',partner:'شريك',unknown:'غير محدد'})[s] || v || 'غير محدد';
}
function userAccessLabel(v='active') {
  return ({active:'نشط',monitor:'تحت المتابعة',suspended:'معلّق إداريًا'})[String(v||'active')] || v || 'نشط';
}
function userAccessClass(v='active') {
  const s=String(v||'active');
  return s==='active'?'review-approved':s==='suspended'?'review-rejected':'review-pending';
}
function userDisplayName(row) { return row.profile_full_name || row.metadata_full_name || row.email || row.phone || shortId(row.user_id); }
function userDisplayPhone(row) { return row.profile_phone || row.metadata_phone || row.phone || 'غير متوفر'; }
function userSearchText(row) {
  return Object.values(row||{}).filter(v=>['string','number','boolean'].includes(typeof v)).join(' ').toLowerCase();
}
async function loadUsersAdminData() {
  try {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) return {ok:false,rows:[],error:error.message};
    return {ok:true,rows:data||[]};
  } catch(e) { return {ok:false,rows:[],error:String(e)}; }
}
function renderUserRows(rows) {
  if (!rows.length) return `<tr><td colspan="6" class="muted-cell">لا توجد حسابات مطابقة للبحث أو الفلتر.</td></tr>`;
  return rows.map(row=>`<tr>
    <td><button class="link-btn user-details-btn primary-entity" data-user-id="${escapeHtml(row.user_id)}">${escapeHtml(userDisplayName(row))}</button><small class="table-subline">${escapeHtml(row.email||'—')}</small></td>
    <td>${escapeHtml(userTypeLabel(row.effective_type))}</td>
    <td>${row.is_admin?'<span class="review-pill review-approved">مدير</span>':'<span class="review-pill neutral-pill">بدون صلاحية إدارية</span>'}</td>
    <td><span class="review-pill ${userAccessClass(row.access_status)}">${escapeHtml(userAccessLabel(row.access_status))}</span></td>
    <td>${row.last_sign_in_at?fmtDate(row.last_sign_in_at):'—'}</td>
    <td><button class="secondary-btn compact user-details-btn" data-user-id="${escapeHtml(row.user_id)}">التفاصيل والصلاحيات</button></td>
  </tr>`).join('');
}
function applyUsersFilters() {
  const q=(document.getElementById('usersSearch')?.value||'').trim().toLowerCase();
  const type=document.getElementById('usersTypeFilter')?.value||'all';
  const access=document.getElementById('usersAccessFilter')?.value||'all';
  usersPageState.filtered=usersPageState.rows.filter(r=>(!q||userSearchText(r).includes(q))&&(type==='all'||r.effective_type===type)&&(access==='all'||r.access_status===access));
  const body=document.getElementById('usersTableBody');if(body)body.innerHTML=renderUserRows(usersPageState.filtered);
  const c=document.getElementById('usersResultCount');if(c)c.textContent=`${fmtNumber(usersPageState.filtered.length)} مستخدم`;
  wireUserRowButtons();
}
function wireUserRowButtons(){document.querySelectorAll('.user-details-btn').forEach(b=>b.addEventListener('click',()=>{const row=usersPageState.rows.find(r=>String(r.user_id)===String(b.dataset.userId));if(row)openUserDetails(row);}));}
function accessOptionsHtml(current='active'){return USER_ACCESS_OPTIONS.map(([v,l])=>`<option value="${v}" ${v===String(current||'active')?'selected':''}>${l}</option>`).join('');}
function openUserDetails(row) {
  usersPageState.selected=row;
  const self=String(row.user_id)===String(usersPageState.currentUserId);
  const overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='userModal';
  overlay.innerHTML=`<section class="modal-card user-modal-card">
    <div class="modal-head"><div><span class="pill">تفاصيل المستخدم</span><h2>${escapeHtml(userDisplayName(row))}</h2><p class="modal-subtitle">معلومات الحساب وحالة المتابعة وصلاحية الدخول إلى لوحة الإدارة.</p></div><button class="icon-btn" id="closeUserModal">✕</button></div>
    <div class="details-grid admin-user-details">
      ${detailItem('الاسم',userDisplayName(row))}${detailItem('البريد',row.email||'غير متوفر')}${detailItem('الهاتف',userDisplayPhone(row))}${detailItem('نوع الحساب',userTypeLabel(row.effective_type))}
      ${detailItem('تاريخ إنشاء الحساب',fmtDate(row.created_at))}${detailItem('آخر تسجيل دخول',row.last_sign_in_at?fmtDate(row.last_sign_in_at):'لم يسجل دخولًا')}${detailItem('متاجر مملوكة',fmtNumber(row.store_count||0))}${detailItem('طلبات كسائق',fmtNumber(row.driver_order_count||0))}
    </div>
    <div class="permission-banner ${row.is_admin?'review-approved':'review-pending'}"><span>صلاحية لوحة الإدارة</span><strong>${row.is_admin?'مدير — مسموح بالدخول':'بدون صلاحية إدارية'}</strong><small>${self?'هذا هو حساب الإدارة المفتوح حاليًا؛ لا يمكن سحب صلاحيته من نفس الجلسة.':'إدارة صلاحيات المدراء تتم من قسم الأمان والصلاحيات فقط.'}</small></div>
    ${!self?`<div class="store-operational-actions"><div class="panel-head"><div><span>إدارة الحساب</span><h3>حالة استخدام الحساب</h3></div><span class="tag">${row.access_status==='suspended'?'موقوف مؤقتًا':'نشط'}</span></div><p class="panel-note">هذا الإجراء مستقل عن صلاحية لوحة الإدارة.</p><div class="inline-actions">${row.access_status==='suspended'?'<button type="button" class="primary-btn compact" id="reactivateUserAccount">إعادة تفعيل الحساب</button>':'<button type="button" class="danger-btn compact" id="suspendUserAccount">إيقاف الحساب مؤقتًا</button>'}</div></div>`:''}
    <div class="review-editor user-permission-editor">
      <label>حالة المتابعة الإدارية<select id="userAccessStatus">${accessOptionsHtml(row.access_status)}</select></label>
      <label>ملاحظات الإدارة<textarea id="userAdminNotes" rows="3" placeholder="ملاحظات داخلية اختيارية...">${escapeHtml(row.admin_notes||'')}</textarea></label>
      <button class="primary-btn compact" id="saveUserPermissions">حفظ الصلاحيات</button>
    </div><div id="userPermissionMessage"></div>
    <details class="raw-details"><summary>بيانات الحساب التقنية</summary><div class="raw-grid">${detailItem('User ID',row.user_id)}${detailItem('Email confirmed',row.email_confirmed_at?fmtDate(row.email_confirmed_at):'غير مؤكد')}${detailItem('partner_type',row.partner_type||'غير محدد')}${detailItem('Admin active',row.admin_active===true?'true':row.admin_active===false?'false':'—')}</div></details>
  </section>`;
  document.body.appendChild(overlay);const close=()=>overlay.remove();document.getElementById('closeUserModal').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close();});document.getElementById('saveUserPermissions').addEventListener('click',()=>saveUserPermissions(row));
  document.getElementById('suspendUserAccount')?.addEventListener('click',async()=>{document.getElementById('userAccessStatus').value='suspended';if(confirm('إيقاف هذا الحساب مؤقتًا؟'))await saveUserPermissions(row);});
  document.getElementById('reactivateUserAccount')?.addEventListener('click',async()=>{document.getElementById('userAccessStatus').value='active';if(confirm('إعادة تفعيل هذا الحساب؟'))await saveUserPermissions(row);});
}
async function saveUserPermissions(row) {
  const btn=document.getElementById('saveUserPermissions'),box=document.getElementById('userPermissionMessage');
  const access_status=document.getElementById('userAccessStatus')?.value||'active';
  const notes=document.getElementById('userAdminNotes')?.value?.trim()||'';
  const self=String(row.user_id)===String(usersPageState.currentUserId);
  const wantsAdmin=Boolean(row.is_admin);
  btn.disabled=true;btn.textContent='جارٍ الحفظ...';box.innerHTML='';
  const { data, error } = await supabase.rpc('admin_update_user_access',{p_user_id:row.user_id,p_make_admin:wantsAdmin,p_access_status:access_status,p_notes:notes});
  btn.disabled=false;btn.textContent='حفظ الصلاحيات';
  if(error){box.innerHTML=`<div class="alert error">تعذر حفظ الصلاحيات: ${escapeHtml(error.message)}. شغّل ملف admin_stage6_rls.sql مرة واحدة.</div>`;return;}
  box.innerHTML='<div class="alert success">تم حفظ صلاحيات المستخدم بنجاح.</div>';
  const fresh=await loadUsersAdminData();if(fresh.ok){usersPageState.rows=fresh.rows;usersPageState.filtered=fresh.rows;const updated=fresh.rows.find(r=>String(r.user_id)===String(row.user_id));if(updated)usersPageState.selected=updated;applyUsersFilters();}
}
async function renderUsersPage() {
  const content=document.getElementById('content');content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تحميل المستخدمين...</h2><p>يتم تجهيز الحسابات والصلاحيات.</p></section>`;
  const [{data:{user}},r]=await Promise.all([supabase.auth.getUser(),loadUsersAdminData()]);
  if(!r.ok){content.innerHTML=`<section class="empty-state"><div class="empty-icon">👥</div><span class="pill">إدارة هلا طلب</span><h2>تعذر قراءة المستخدمين</h2><p>${escapeHtml(r.error||'خطأ غير معروف')}</p><p>شغّل ملف <b>admin_stage6_rls.sql</b> ثم أعد المحاولة.</p></section>`;return;}
  usersPageState.currentUserId=user?.id||null;usersPageState.rows=r.rows;usersPageState.filtered=r.rows;
  const types={admin:0,store_owner:0,driver:0,customer:0};r.rows.forEach(x=>{if(types[x.effective_type]!==undefined)types[x.effective_type]++;});
  content.innerHTML=`<section class="dashboard-hero"><div><span class="pill">إدارة يومية</span><h2>المستخدمون</h2><p>ابحث عن أي حساب، اعرف نوعه وحالته، وأدر صلاحية الوصول إلى لوحة الإدارة عند الحاجة.</p></div><button id="refreshUsers" class="secondary-btn">↻ تحديث المستخدمين</button></section>
    <section class="store-summary-grid">${actionMetricCard('إجمالي المستخدمين',fmtNumber(r.rows.length),'كل الحسابات المسجلة','👥','users','all')}${actionMetricCard('المدراء',fmtNumber(types.admin),'لديهم صلاحية لوحة الإدارة','🛡️','users','admin')}${actionMetricCard('أصحاب المتاجر',fmtNumber(types.store_owner),'حسابات أصحاب المتاجر','🏪','users','store_owner')}${actionMetricCard('السائقون',fmtNumber(types.driver),'حسابات السائقين','🚚','users','driver')}</section>
    <section class="stores-toolbar"><label class="search-box">🔎<input id="usersSearch" type="search" placeholder="ابحث بالاسم، البريد، الهاتف..." /></label><select id="usersTypeFilter"><option value="all">كل أنواع الحساب</option><option value="admin">مدير</option><option value="store_owner">صاحب متجر</option><option value="driver">سائق</option><option value="customer">عميل</option></select><select id="usersAccessFilter"><option value="all">كل حالات المتابعة</option>${USER_ACCESS_OPTIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><span id="usersResultCount" class="tag">${fmtNumber(r.rows.length)} مستخدم</span></section>
    <article class="panel stores-panel"><div class="table-wrap"><table class="data-table users-table"><thead><tr><th>المستخدم</th><th>نوع الحساب</th><th>صلاحية الإدارة</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead><tbody id="usersTableBody">${renderUserRows(r.rows)}</tbody></table></div></article>`;
  document.getElementById('refreshUsers')?.addEventListener('click',renderUsersPage);document.getElementById('usersSearch')?.addEventListener('input',applyUsersFilters);document.getElementById('usersTypeFilter')?.addEventListener('change',applyUsersFilters);document.getElementById('usersAccessFilter')?.addEventListener('change',applyUsersFilters);document.querySelectorAll('[data-metric-action="users"]').forEach(b=>b.addEventListener('click',()=>{const sel=document.getElementById('usersTypeFilter');if(sel)sel.value=b.dataset.metricValue||'all';applyUsersFilters();document.querySelector('.stores-toolbar')?.scrollIntoView({behavior:'smooth',block:'start'});}));wireUserRowButtons();consumePendingAdminTarget('users');
}


// إدارة هلا طلب — Reports & analytics
let reportsPageState = { orders:[], stores:new Map(), profiles:new Map(), dateField:null, filtered:[] };

function reportOrderDate(row) {
  const key = reportsPageState.dateField || detectDateField([row]);
  const value = key ? row?.[key] : pick(row,['created_at','placed_at','ordered_at','order_date','accepted_at'],null);
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function reportOrderAmount(row) { return numericPick(row,['total','total_amount','grand_total','amount','final_total','order_total','total_price']); }
function reportPayment(row) { return String(pick(row,['payment_method'],'غير محدد')||'غير محدد').toLowerCase(); }
function reportStoreName(row) { const s=reportsPageState.stores.get(String(row.store_id||'')); return pick(row,['store_name','restaurant_name'],pick(s,['name'],'غير معروف')); }
function reportDriverName(row) { if(!row.driver_id) return 'غير مسند'; const p=reportsPageState.profiles.get(String(row.driver_id)); return pick(p,['full_name','email'],shortId(row.driver_id)); }
function reportArea(row) {
  const raw=String(pick(row,['delivery_area','area','district','city','delivery_address'],'غير محدد')||'غير محدد').trim();
  if (!raw || raw==='—') return 'غير محدد';
  // Keep a useful compact grouping for free-text addresses.
  const normalized=raw.replace(/\s+/g,' ').trim();
  const separators=['،',',','-','–','|'];
  for (const sep of separators) if (normalized.includes(sep)) return normalized.split(sep)[0].trim().slice(0,40)||'غير محدد';
  return normalized.slice(0,40);
}
function reportDateKey(d) { return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''; }
function dateInputValue(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function statusColorClass(status){const k=normalizeStatus(status);return ['delivered','ready','accepted','preparing','pending','cancelled','picked_up'].includes(k)?`bar-${k}`:'bar-other';}
function aggregateCount(rows,keyFn){const m=new Map();for(const r of rows){const k=String(keyFn(r)||'غير محدد');m.set(k,(m.get(k)||0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);}
function aggregateAmount(rows,keyFn){const m=new Map();for(const r of rows){const k=String(keyFn(r)||'غير محدد');const cur=m.get(k)||{count:0,amount:0};cur.count++;cur.amount+=reportOrderAmount(r);m.set(k,cur);}return [...m.entries()].sort((a,b)=>b[1].amount-a[1].amount);}
function reportBarRows(items,{money=false,labelFn=null,classFn=null,maxItems=8}={}){
  const sliced=items.slice(0,maxItems);const vals=sliced.map(x=>money?Number(x[1]?.amount||0):Number(x[1]||0));const max=Math.max(1,...vals);
  if(!sliced.length)return '<div class="report-empty">لا توجد بيانات ضمن الفلاتر الحالية.</div>';
  return sliced.map(([label,val])=>{const num=money?Number(val.amount||0):Number(val||0);const width=Math.max(3,Math.round((num/max)*100));const shown=money?fmtMoney(num):fmtNumber(num);const cls=classFn?classFn(label):'';return `<div class="report-bar-row"><div class="report-bar-label"><span>${escapeHtml(labelFn?labelFn(label):label)}</span><b>${shown}</b></div><div class="report-bar-track"><i class="${cls}" style="width:${width}%"></i></div></div>`}).join('');
}
function reportStatusLabel(v){return statusLabel(v)||v||'غير محدد';}
function performanceMetrics(rows){
  const delivered=rows.filter(r=>normalizeStatus(pick(r,['status','order_status'],''))==='delivered');
  const cancelled=rows.filter(r=>normalizeStatus(pick(r,['status','order_status'],''))==='cancelled');
  const assigned=rows.filter(r=>Boolean(r.driver_id));
  const durations=[];
  for(const r of delivered){const start=new Date(pick(r,['created_at','placed_at','ordered_at'],''));const end=new Date(pick(r,['delivered_at'],''));if(!Number.isNaN(start.getTime())&&!Number.isNaN(end.getTime())&&end>=start)durations.push((end-start)/60000);}
  return {
    deliveryRate: rows.length ? delivered.length/rows.length*100 : 0,
    cancelRate: rows.length ? cancelled.length/rows.length*100 : 0,
    assignedRate: rows.length ? assigned.length/rows.length*100 : 0,
    avgMinutes: durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : null
  };
}
async function loadReportsData(){
  const [ordersR,storesR,profilesR]=await Promise.all([fetchAdminRows('orders'),fetchAdminRows('stores'),fetchAdminRows('partner_profiles')]);
  if(!ordersR.ok)return {ok:false,error:ordersR.error};
  const stores=new Map((storesR.ok?storesR.rows:[]).map(r=>[String(r.id),r]));
  const profiles=new Map((profilesR.ok?profilesR.rows:[]).map(r=>[String(r.id),r]));
  const dateField=detectDateField(ordersR.rows);
  return {ok:true,orders:ordersR.rows,stores,profiles,dateField};
}
function reportsFilters(){return {
  from:document.getElementById('reportFrom')?.value||'',to:document.getElementById('reportTo')?.value||'',
  status:document.getElementById('reportStatus')?.value||'all',payment:document.getElementById('reportPayment')?.value||'all',
  store:document.getElementById('reportStore')?.value||'all',area:(document.getElementById('reportArea')?.value||'').trim().toLowerCase()
};}
function filterReportRows(rows,f){
  const from=f.from?new Date(`${f.from}T00:00:00`):null;const to=f.to?new Date(`${f.to}T23:59:59.999`):null;
  return rows.filter(r=>{const d=reportOrderDate(r);const st=normalizeStatus(pick(r,['status','order_status'],''));const pay=reportPayment(r);const area=reportArea(r).toLowerCase();
    return (!from||!d||d>=from)&&(!to||!d||d<=to)&&(f.status==='all'||st===f.status)&&(f.payment==='all'||pay===f.payment)&&(f.store==='all'||String(r.store_id||'')===f.store)&&(!f.area||area.includes(f.area));});
}
function renderReportsAnalytics(){
  const content=document.getElementById('reportsResults');if(!content)return;
  const rows=filterReportRows(reportsPageState.orders,reportsFilters());reportsPageState.filtered=rows;
  const revenue=rows.reduce((s,r)=>s+reportOrderAmount(r),0);const avg=rows.length?revenue/rows.length:0;
  const uniqueStores=new Set(rows.map(r=>r.store_id).filter(Boolean)).size;const uniqueDrivers=new Set(rows.map(r=>r.driver_id).filter(Boolean)).size;
  const daily=aggregateAmount(rows,r=>{const d=reportOrderDate(r);return d?reportDateKey(d):'بدون تاريخ';}).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).slice(-14);
  const statuses=aggregateCount(rows,r=>normalizeStatus(pick(r,['status','order_status'],'غير محدد'))||'غير محدد');
  const stores=aggregateAmount(rows,r=>reportStoreName(r));const drivers=aggregateCount(rows,r=>reportDriverName(r)).filter(([k])=>k!=='غير مسند');const areas=aggregateCount(rows,r=>reportArea(r));
  const perf=performanceMetrics(rows);
  content.innerHTML=`
    <section class="report-metrics-grid">
      ${actionMetricCard('الطلبات',fmtNumber(rows.length),'ضمن الفلاتر الحالية','📦','reports','orders')}
      ${actionMetricCard('إجمالي القيمة',fmtMoney(revenue),'مجموع إجمالي الطلبات','💰','reports','revenue')}
      ${actionMetricCard('متوسط الطلب',fmtMoney(avg),'متوسط قيمة الطلب','🧮','reports','average')}
      ${actionMetricCard('متاجر نشطة',fmtNumber(uniqueStores),'لديها طلبات ضمن الفترة','🏪','reports','stores')}
      ${actionMetricCard('سائقون نشطون',fmtNumber(uniqueDrivers),'مسند لهم طلبات ضمن الفترة','🚚','reports','drivers')}
    </section>
    <section class="reports-grid">
      <article class="panel report-panel report-wide"><div class="panel-head"><div><span>الاتجاه الزمني</span><h3>قيمة الطلبات حسب اليوم</h3></div><span class="tag">آخر 14 يومًا ضمن النطاق</span></div><div class="report-bars">${reportBarRows(daily,{money:true,maxItems:14})}</div></article>
      <article class="panel report-panel"><div class="panel-head"><div><span>التوزيع</span><h3>حالات الطلبات</h3></div></div><div class="report-bars">${reportBarRows(statuses,{labelFn:reportStatusLabel,classFn:statusColorClass,maxItems:10})}</div></article>
      <article class="panel report-panel"><div class="panel-head"><div><span>الأداء</span><h3>مؤشرات التشغيل</h3></div></div><div class="performance-list">
        <div><span>نسبة التسليم</span><b>${perf.deliveryRate.toFixed(1)}%</b></div><div><span>نسبة الإلغاء</span><b>${perf.cancelRate.toFixed(1)}%</b></div><div><span>نسبة إسناد سائق</span><b>${perf.assignedRate.toFixed(1)}%</b></div><div><span>متوسط زمن التسليم</span><b>${perf.avgMinutes==null?'غير متاح':`${Math.round(perf.avgMinutes)} دقيقة`}</b></div>
      </div></article>
      <article class="panel report-panel"><div class="panel-head"><div><span>الأفضل</span><h3>أفضل المتاجر بالقيمة</h3></div></div><div class="rank-list">${stores.slice(0,8).map(([n,v],i)=>`<div><span><b>${i+1}</b>${escapeHtml(n)}</span><strong>${fmtMoney(v.amount)} <small>(${fmtNumber(v.count)} طلب)</small></strong></div>`).join('')||'<div class="report-empty">لا توجد بيانات.</div>'}</div></article>
      <article class="panel report-panel"><div class="panel-head"><div><span>السائقون</span><h3>الأكثر ظهورًا في الطلبات</h3></div></div><div class="rank-list">${drivers.slice(0,8).map(([n,v],i)=>`<div><span><b>${i+1}</b>${escapeHtml(n)}</span><strong>${fmtNumber(v)} طلب</strong></div>`).join('')||'<div class="report-empty">لا توجد بيانات.</div>'}</div></article>
      <article class="panel report-panel"><div class="panel-head"><div><span>المناطق</span><h3>الطلبات حسب عنوان التوصيل</h3></div></div><div class="report-bars">${reportBarRows(areas,{maxItems:8})}</div></article>
    </section><section id="reportMetricDetail" class="panel report-metric-detail" hidden></section>`;
  const count=document.getElementById('reportFilteredCount');if(count)count.textContent=`${fmtNumber(rows.length)} طلب`;
  document.querySelectorAll('[data-metric-action="reports"]').forEach(b=>b.addEventListener('click',()=>showReportMetricDetail(b.dataset.metricValue,rows,revenue,avg)));
}
function showReportMetricDetail(type,rows,revenue,avg){const host=document.getElementById('reportMetricDetail');if(!host)return;let title='تفاصيل';let html='';if(type==='orders'){title='الطلبات ضمن الفلاتر';html=`<div class="table-wrap"><table class="data-table"><thead><tr><th>الطلب</th><th>المتجر</th><th>الحالة</th><th>القيمة</th><th>التاريخ</th></tr></thead><tbody>${rows.slice(0,50).map(r=>`<tr><td>${escapeHtml(String(pick(r,['order_number','id'],'—')))}</td><td>${escapeHtml(reportStoreName(r))}</td><td>${escapeHtml(reportStatusLabel(normalizeStatus(pick(r,['status','order_status'],''))))}</td><td>${fmtMoney(reportOrderAmount(r))}</td><td>${reportOrderDate(r)?fmtDate(reportOrderDate(r)):'—'}</td></tr>`).join('')||'<tr><td colspan="5" class="muted-cell">لا توجد طلبات.</td></tr>'}</tbody></table></div>`;}else if(type==='revenue'){title='تفصيل إجمالي القيمة';html=`<p>إجمالي القيمة هو مجموع قيمة <b>${fmtNumber(rows.length)}</b> طلب ضمن الفلاتر الحالية.</p><div class="big-detail-value">${fmtMoney(revenue)}</div>`;}else if(type==='average'){title='كيف حُسب متوسط الطلب؟';html=`<p>متوسط الطلب = إجمالي القيمة ÷ عدد الطلبات.</p><div class="calculation-box">${fmtMoney(revenue)} ÷ ${fmtNumber(rows.length)} = <b>${fmtMoney(avg)}</b></div>`;}else if(type==='stores'){title='المتاجر النشطة';const a=aggregateCount(rows,r=>reportStoreName(r));html=`<div class="rank-list">${a.map(([n,v])=>`<div><span>${escapeHtml(n)}</span><strong>${fmtNumber(v)} طلب</strong></div>`).join('')||'<div class="report-empty">لا توجد بيانات.</div>'}</div>`;}else if(type==='drivers'){title='السائقون النشطون';const a=aggregateCount(rows,r=>reportDriverName(r)).filter(([n])=>n!=='غير مسند');html=`<div class="rank-list">${a.map(([n,v])=>`<div><span>${escapeHtml(n)}</span><strong>${fmtNumber(v)} طلب</strong></div>`).join('')||'<div class="report-empty">لا توجد بيانات.</div>'}</div>`;}host.hidden=false;host.innerHTML=`<div class="panel-head"><div><span>تفاصيل المؤشر</span><h3>${title}</h3></div><button type="button" class="secondary-btn compact" id="closeReportMetricDetail">إغلاق</button></div>${html}`;document.getElementById('closeReportMetricDetail')?.addEventListener('click',()=>host.hidden=true);host.scrollIntoView({behavior:'smooth',block:'start'});}
function reportPaymentLabel(v){
  const p=String(v||'غير محدد').toLowerCase();
  if(p==='cash') return 'نقدًا';
  if(p==='card') return 'بطاقة';
  if(p==='online') return 'دفع إلكتروني';
  return p==='غير محدد'?'غير محدد':v;
}
function reportRangeLabel(){
  const f=reportsFilters();
  const store=f.store==='all'?'كل المتاجر':(reportsPageState.stores.get(String(f.store))?.name||'متجر محدد');
  const status=f.status==='all'?'كل الحالات':reportStatusLabel(f.status);
  const payment=f.payment==='all'?'كل طرق الدفع':reportPaymentLabel(f.payment);
  const area=f.area?`العنوان يحتوي: ${f.area}`:'كل المناطق';
  return `${f.from||'—'} إلى ${f.to||'—'} • ${store} • ${status} • ${payment} • ${area}`;
}
function exportReportsCsv(){
  const rows=reportsPageState.filtered||[];const headers=['رقم الطلب','التاريخ','المتجر','السائق','الحالة','طريقة الدفع','المنطقة / العنوان','الإجمالي'];
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const lines=[headers.map(q).join(',')];for(const r of rows){lines.push([pick(r,['order_number','id'],''),reportOrderDate(r)?.toLocaleString('ar-IQ')||'',reportStoreName(r),reportDriverName(r),reportStatusLabel(pick(r,['status','order_status'],'')),reportPaymentLabel(reportPayment(r)),reportArea(r),reportOrderAmount(r)].map(q).join(','));}
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`hala-talab-report-${dateInputValue(new Date())}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function exportReportsPdf(){
  const oldTitle=document.title;
  const stamp=dateInputValue(new Date());
  document.title=`Hala-Talab-Report-${stamp}`;
  document.body.classList.add('report-export-mode');
  const note=document.getElementById('reportPrintSummary');if(note){note.textContent=reportRangeLabel();note.hidden=false;}
  setTimeout(()=>{window.print();setTimeout(()=>{document.title=oldTitle;document.body.classList.remove('report-export-mode');if(note)note.hidden=true;},350);},180);
}
function setReportQuickRange(kind){
  const from=document.getElementById('reportFrom'),to=document.getElementById('reportTo');if(!from||!to)return;
  const now=new Date();let start=new Date(now);
  if(kind==='today'){start=new Date(now.getFullYear(),now.getMonth(),now.getDate());}
  else if(kind==='week'){start=new Date(now);start.setDate(now.getDate()-6);}
  else if(kind==='month'){start=new Date(now.getFullYear(),now.getMonth(),1);}
  from.value=dateInputValue(start);to.value=dateInputValue(now);renderReportsAnalytics();
  const label=kind==='today'?'اليوم':kind==='week'?'آخر 7 أيام':'هذا الشهر';
  const el=document.getElementById('reportFilterStatus');if(el)el.textContent=`✓ تم اختيار: ${label}`;
}
async function renderReportsPage(){
  const content=document.getElementById('content');content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تجهيز التقارير...</h2><p>يتم تحليل بيانات orders وstores وpartner_profiles مباشرة من Supabase.</p></section>`;
  const r=await loadReportsData();if(!r.ok){content.innerHTML=`<section class="empty-state"><div class="empty-icon">📊</div><span class="pill">إدارة هلا طلب</span><h2>تعذر تحميل التقارير</h2><p>${escapeHtml(r.error||'خطأ غير معروف')}</p><p>تأكد من تشغيل SQL المراحل السابقة وصلاحية قراءة orders.</p></section>`;return;}
  reportsPageState.orders=r.orders;reportsPageState.stores=r.stores;reportsPageState.profiles=r.profiles;reportsPageState.dateField=r.dateField;
  const dates=r.orders.map(x=>reportOrderDate(x)).filter(Boolean).sort((a,b)=>a-b);const minDate=dates[0]||new Date();const maxDate=dates[dates.length-1]||new Date();
  const payments=[...new Set(r.orders.map(reportPayment))].sort();const stores=[...r.stores.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'));
  content.innerHTML=`<section class="dashboard-hero"><div><span class="pill">إدارة هلا طلب</span><h2>التقارير والتحليلات</h2><p>اختر الفترة والمتجر والحالة ثم احفظ التقرير PDF أو صدّره CSV. كل خيارات التصدير تعتمد على النتائج المفلترة فقط.</p><p id="reportPrintSummary" class="report-print-summary" hidden></p></div><div class="hero-actions"><button id="exportPdfReport" class="primary-btn">📄 حفظ PDF</button><button id="exportReport" class="secondary-btn">⬇ CSV</button><button id="printReport" class="secondary-btn">🖨 طباعة</button></div></section>
    <section class="report-filters panel"><div class="report-quick-ranges"><span>فترة سريعة:</span><button type="button" class="secondary-btn compact" data-report-range="today">اليوم</button><button type="button" class="secondary-btn compact" data-report-range="week">آخر 7 أيام</button><button type="button" class="secondary-btn compact" data-report-range="month">هذا الشهر</button></div><div class="report-filter-grid"><label>من<input id="reportFrom" type="date" value="${dateInputValue(minDate)}"></label><label>إلى<input id="reportTo" type="date" value="${dateInputValue(maxDate)}"></label><label>الحالة<select id="reportStatus"><option value="all">كل الحالات</option>${ORDER_STATUS_OPTIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>طريقة الدفع<select id="reportPayment"><option value="all">كل طرق الدفع</option>${payments.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(reportPaymentLabel(p))}</option>`).join('')}</select></label><label>المتجر<select id="reportStore"><option value="all">كل المتاجر</option>${stores.map(s=>`<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name||shortId(s.id))}</option>`).join('')}</select></label><label>المنطقة / العنوان<input id="reportArea" type="search" placeholder="ابحث بجزء من عنوان التوصيل"></label></div><div class="report-filter-actions"><button id="applyReports" class="primary-btn compact">تطبيق الفلاتر</button><button id="resetReports" class="secondary-btn compact">إعادة الضبط</button><span id="reportFilterStatus" class="tag" aria-live="polite"></span></div><div class="report-results-summary"><span>النتائج</span><strong id="reportFilteredCount">0 طلب</strong></div></section><div id="reportsResults"></div>`;
  const setFilterStatus=(msg)=>{const el=document.getElementById('reportFilterStatus');if(!el)return;el.textContent=msg;clearTimeout(window.__reportFilterTimer);window.__reportFilterTimer=setTimeout(()=>{if(el)el.textContent='';},2600);};
  const applyFilters=()=>{renderReportsAnalytics();setFilterStatus('✓ تم تطبيق الفلاتر');document.getElementById('reportsResults')?.scrollIntoView({behavior:'smooth',block:'start'});};
  document.getElementById('applyReports')?.addEventListener('click',applyFilters);
  document.getElementById('resetReports')?.addEventListener('click',()=>{document.getElementById('reportFrom').value=dateInputValue(minDate);document.getElementById('reportTo').value=dateInputValue(maxDate);document.getElementById('reportStatus').value='all';document.getElementById('reportPayment').value='all';document.getElementById('reportStore').value='all';document.getElementById('reportArea').value='';renderReportsAnalytics();setFilterStatus('↺ تمت إعادة الضبط');});
  document.getElementById('exportReport')?.addEventListener('click',exportReportsCsv);document.getElementById('exportPdfReport')?.addEventListener('click',exportReportsPdf);document.getElementById('printReport')?.addEventListener('click',()=>window.print());document.querySelectorAll('[data-report-range]').forEach(btn=>btn.addEventListener('click',()=>setReportQuickRange(btn.dataset.reportRange)));renderReportsAnalytics();
}


// إدارة هلا طلب — System Management (integrated; no dynamic import)
let systemSupportRealtimeChannel = null;
let systemSupportRealtimeTimer = null;
let systemSupportRealtimeRetryTimer = null;
let systemSupportRealtimeSafetyTimer = null;
let systemSupportRealtimeStatus = 'idle';

const systemPageState = {
  tab: 'overview',
  categories: [], clientCategories: [], coupons: [], platformCoupons: [], couponSettlements: [], promotions: [], platformOffers: [], support: [], partnerSupport: [], pinResets: [], commissions: [], subscriptions: [], settings: [], audit: [], stores: [],
  categoryTable: null, clientCategoryTable: null, couponTable: null, platformCouponTable: null, promotionTable: null, supportTable: null, partnerSupportTable: null, pinResetTable: null,
  offerFilter: 'all', offerSearch: '', editingPlatformCouponId:null, editingPlatformOfferId:null, settlementFilter:'all', settlementSearch:'',
  categorySearch:'', categoryStoreFilter:'all', categoryStatusFilter:'all', editingCategoryId:null,
  clientCategorySearch:'', clientCategoryStatusFilter:'all', editingClientCategoryId:null,
  financeSearch:'', financeStoreFilter:'all', financeStatusFilter:'all', editingCommissionId:null, editingSubscriptionId:null,
  pinPartnerFilter:'all',
};
const SYSTEM_TABS = [
  ['overview','نظرة عامة'], ['client-categories','تصنيفات العميل'], ['categories','أقسام منتجات المتاجر'], ['offers','الكوبونات والعروض'],
  ['finance','العمولات والاشتراكات'], ['pin-customers','استرجاع PIN العملاء'], ['pin-partners','استرجاع PIN الشركاء'], ['support','الدعم'], ['settings','إعدادات النظام'], ['audit','سجل العمليات']
];
async function systemSafeRows(table, limit=5000) {
  try {
    const { data, error } = await supabase.from(table).select('*').limit(limit);
    return error ? { ok:false, rows:[], error:error.message } : { ok:true, rows:data || [] };
  } catch (e) { return { ok:false, rows:[], error:String(e) }; }
}
async function systemFirstRows(list) {
  for (const table of list) {
    const r = await systemSafeRows(table);
    if (r.ok) return { ...r, table };
  }
  return { ok:false, rows:[], table:null };
}
async function loadSystemData() {
  const [categories, clientCategories, coupons, platformCoupons, couponSettlements, promotions, support, partnerSupport, pinResets, commissions, subscriptions, settings, audit, stores] = await Promise.all([
    systemFirstRows(['product_categories','store_categories']),
    systemFirstRows(['system_categories']),
    systemFirstRows(['coupons']),
    systemFirstRows(['platform_coupon_campaigns']),
    systemFirstRows(['platform_coupon_settlements']),
    systemFirstRows(['store_promotions','promotions']),
    systemFirstRows(['customer_support_conversations','support_tickets']),
    systemFirstRows(['partner_support_tickets']),
    systemFirstRows(['phone_pin_reset_requests']),
    systemSafeRows('admin_commission_rules'),
    systemSafeRows('admin_subscriptions'),
    systemSafeRows('admin_system_settings'),
    systemSafeRows('admin_audit_log', 1000),
    systemSafeRows('stores'),
  ]);
  Object.assign(systemPageState, {
    categories:categories.rows, categoryTable:categories.table,
    clientCategories:clientCategories.rows, clientCategoryTable:clientCategories.table,
    coupons:coupons.rows, couponTable:coupons.table,
    platformCoupons:platformCoupons.rows, platformCouponTable:platformCoupons.table,
    couponSettlements:couponSettlements.rows,
    promotions:promotions.rows, promotionTable:promotions.table,
    platformOffers:promotions.rows.filter(r=>String(r.source||'').toLowerCase()==='admin'),
    support:support.rows, supportTable:support.table,
    partnerSupport:partnerSupport.rows, partnerSupportTable:partnerSupport.table,
    pinResets:pinResets.rows, pinResetTable:pinResets.table,
    commissions:commissions.rows, subscriptions:subscriptions.rows,
    settings:settings.rows, audit:audit.rows, stores:stores.rows,
  });
}
function systemBool(value) { return value === true || value === 1 || String(value).toLowerCase() === 'true'; }
function systemShort(value) { const s=String(value || '—'); return s.length>14 ? `${s.slice(0,8)}…${s.slice(-4)}` : s; }
function systemStoreName(id) {
  if (!id) return 'عام';
  const row = systemPageState.stores.find((x) => String(x.id) === String(id));
  return row && row.name ? row.name : systemShort(id);
}
function systemSetting(key, fallback='') {
  const row = systemPageState.settings.find((x) => x.setting_key === key);
  return row && row.setting_value !== undefined && row.setting_value !== null ? row.setting_value : fallback;
}
function systemSourceCard(label,count,table,icon) {
  return `<article class="system-source-card"><div class="system-source-icon">${icon}</div><div><span>${label}</span><strong>${fmtNumber(count)}</strong><small>بيانات مرتبطة ومحدّثة</small></div></article>`;
}
function renderSystemOverview() {
  const driverApprovalRaw=String(systemSetting('driver_approval_required','false')).toLowerCase();
  const driverApprovalRequired=['true','1','yes','on'].includes(driverApprovalRaw);
  return `<section class="panel driver-signup-quick-control">
    <div class="panel-head"><div><span>تحكم سريع</span><h3>تسجيل السائقين</h3></div><span class="status-chip ${driverApprovalRequired?'status-pending':'status-ready'}">${driverApprovalRequired?'موافقة الإدارة مطلوبة':'مفتوح مباشرة'}</span></div>
    <p>${driverApprovalRequired?'أي سائق جديد يبقى قيد المراجعة حتى توافق الإدارة عليه.':'أي سائق جديد يدخل مباشرة بعد إكمال التسجيل.'}</p>
    <div class="inline-actions"><button type="button" class="${driverApprovalRequired?'secondary-btn':'primary-btn'} compact" id="overviewDriverApprovalToggle" data-driver-approval-toggle="${driverApprovalRequired?'false':'true'}">${driverApprovalRequired?'فتح التسجيل المباشر':'تفعيل موافقة الإدارة'}</button><button type="button" class="secondary-btn compact" id="openSystemSettingsFromOverview">فتح كل إعدادات النظام</button></div>
    <div id="overviewDriverApprovalMessage"></div>
  </section>
  <section class="system-overview-grid">
    ${systemSourceCard('تصنيفات العميل',systemPageState.clientCategories.length,systemPageState.clientCategoryTable,'🏠')}
    ${systemSourceCard('أقسام المنتجات',systemPageState.categories.length,systemPageState.categoryTable,'🗂')}
    ${systemSourceCard('الكوبونات',systemPageState.coupons.length,systemPageState.couponTable,'🎟')}
    ${systemSourceCard('العروض',systemPageState.promotions.length,systemPageState.promotionTable,'🏷')}
    ${systemSourceCard('محادثات الدعم',systemPageState.support.length,systemPageState.supportTable,'🎧')}
  </section><article class="panel system-intro polish4-simple"><div class="panel-head"><div><span>إدارة هلا طلب</span><h3>إدارة المنصة بشكل مبسّط</h3></div><span class="dot online"></span></div><p>من هنا تراجع أقسام منتجات المتاجر، الكوبونات والعروض، الدعم وإعدادات المنصة. الأدوات المالية المتقدمة محفوظة في تبويب مستقل للاستخدام عند الحاجة مستقبلًا.</p></article>`;
}
function wireSystemOverview(){
  document.getElementById('openSystemSettingsFromOverview')?.addEventListener('click',()=>{
    systemPageState.tab='settings';
    document.querySelectorAll('[data-system-tab]').forEach(x=>x.classList.toggle('active',x.dataset.systemTab==='settings'));
    renderSystemTab();
  });
  document.getElementById('overviewDriverApprovalToggle')?.addEventListener('click',async e=>{
    const value=e.currentTarget.dataset.driverApprovalToggle;
    const enabling=value==='true';
    const message=enabling
      ? 'بعد التفعيل، أي سائق جديد سيبقى قيد المراجعة حتى توافق الإدارة. السائقون المقبولون سابقًا يستمرون طبيعيًا. هل تريد المتابعة؟'
      : 'فتح تسجيل السائقين مباشرة؟ السائق الجديد سيدخل فور إكمال التسجيل بدون انتظار موافقة الإدارة.';
    if(!confirm(message))return;
    const box=document.getElementById('overviewDriverApprovalMessage');
    if(box)box.innerHTML='<div class="alert info">جارٍ حفظ الإعداد...</div>';
    if(await updateSystemSettingValue('driver_approval_required',value)){
      await systemAudit(enabling?'enable_driver_approval':'disable_driver_approval','system_setting','driver_approval_required',{value});
      renderSystemTab();
    }else if(box){box.innerHTML='<div class="alert error">تعذر حفظ الإعداد.</div>';}
  });
}

function clientCategoryName(r){ return pick(r,['name_ar','name','title'],'تصنيف'); }
function clientCategoryActive(r){ return systemBool(pick(r,['is_active','active','enabled'],true)); }
function clientCategoryOrder(r){ return Number(pick(r,['sort_order','position','order_index','display_order'],0)||0); }
function filteredClientCategoryRows(){
  const q=String(systemPageState.clientCategorySearch||'').trim().toLowerCase();
  const st=systemPageState.clientCategoryStatusFilter||'all';
  return systemPageState.clientCategories.filter(r=>{
    const active=clientCategoryActive(r);
    const matchQ=!q||[clientCategoryName(r),r.name_ku||'',r.name_en||'',r.icon||''].join(' ').toLowerCase().includes(q);
    const matchStatus=st==='all'||(st==='active'&&active)||(st==='paused'&&!active);
    return matchQ&&matchStatus;
  }).sort((a,b)=>clientCategoryOrder(a)-clientCategoryOrder(b));
}
function renderClientCategories(){
  if(!systemPageState.clientCategoryTable) return `<section class="empty-state compact-empty"><div class="empty-icon">🏠</div><h3>جدول تصنيفات العميل غير جاهز بعد</h3><p>شغّل ملف SQL الخاص بهذه المرحلة مرة واحدة، ثم اضغط تحديث البيانات.</p></section>`;
  const rows=filteredClientCategoryRows();
  const all=systemPageState.clientCategories;
  const editingId=systemPageState.editingClientCategoryId;
  const editing=all.find(r=>String(r.id)===String(editingId||''));
  const editorOpen=!!editingId;
  return `<div class="system-section-head"><div><h3>تصنيفات واجهة العميل</h3><p>هذه هي التصنيفات الرئيسية التي تظهر للعميل مثل مطاعم، بقالة، حلويات وصيدليات. التصنيف الفعّال يصبح متاحًا للتطبيق مباشرة من Supabase.</p></div><button type="button" id="newClientCategory" class="primary-btn compact">＋ إضافة تصنيف جديد</button></div>
  <section class="management-toolbar panel client-category-toolbar"><label class="search-box">🔎<input id="clientCategorySearch" type="search" value="${escapeHtml(systemPageState.clientCategorySearch||'')}" placeholder="ابحث باسم التصنيف..."></label><label>الحالة<select id="clientCategoryStatusFilter"><option value="all" ${systemPageState.clientCategoryStatusFilter==='all'?'selected':''}>كل الحالات</option><option value="active" ${systemPageState.clientCategoryStatusFilter==='active'?'selected':''}>فعال</option><option value="paused" ${systemPageState.clientCategoryStatusFilter==='paused'?'selected':''}>موقوف</option></select></label><button type="button" class="secondary-btn compact" id="resetClientCategoryFilters">إعادة الضبط</button></section>
  <article class="panel category-editor" id="clientCategoryEditor" ${editorOpen?'':'hidden'}><div class="panel-head"><div><span>${editing?'تعديل التصنيف':'تصنيف جديد'}</span><h3>${editing?'تعديل تصنيف العميل':'إضافة تصنيف جديد'}</h3></div>${editing?'<span class="tag status-pending">وضع التعديل</span>':''}</div><form id="clientCategoryForm" class="category-create-form" autocomplete="off"><div class="settings-form-grid category-form-grid">
  <div class="category-field"><label for="clientCategoryNameAr">الاسم بالعربية <span class="required-mark">*</span></label><input id="clientCategoryNameAr" type="text" required value="${escapeHtml(editing?clientCategoryName(editing):'')}" placeholder="مثال: مطاعم"></div>
  <div class="category-field"><label for="clientCategoryNameKu">الاسم بالكردية</label><input id="clientCategoryNameKu" type="text" value="${escapeHtml(editing?.name_ku||'')}" placeholder="اختياري"></div>
  <div class="category-field"><label for="clientCategoryNameEn">الاسم بالإنجليزية</label><input id="clientCategoryNameEn" type="text" value="${escapeHtml(editing?.name_en||'')}" placeholder="Restaurants"></div>
  <div class="category-field"><label for="clientCategoryIcon">الأيقونة</label><input id="clientCategoryIcon" type="text" value="${escapeHtml(editing?.icon||'')}" placeholder="مثال: 🍔"><small class="field-hint">يمكنك لصق Emoji مباشرة مثل 🍔 🛒 🍰 ☕ 💐</small></div>
  <div class="category-field category-image-field"><label>صورة التصنيف</label><div class="category-image-upload-row"><input id="clientCategoryImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><button type="button" id="uploadClientCategoryImage" class="secondary-btn compact">⬆ رفع صورة</button></div><input id="clientCategoryImage" type="url" value="${escapeHtml(editing?.image_url||'')}" placeholder="يُملأ الرابط تلقائيًا بعد رفع الصورة"><small class="field-hint">اختر الصورة من الجهاز، وسيتم رفعها إلى Supabase Storage وحفظ الرابط تلقائيًا.</small>${editing?.image_url?`<div class="category-image-preview"><img src="${escapeHtml(editing.image_url)}" alt="صورة التصنيف"></div>`:''}</div>
  <div class="category-field"><label for="clientCategoryColor">اللون</label><input id="clientCategoryColor" type="text" value="${escapeHtml(editing?.color_hex||'#FF7A00')}" placeholder="#FF7A00"></div>
  <div class="category-field"><label for="clientCategoryOrder">الترتيب</label><input id="clientCategoryOrder" type="number" min="1" step="1" value="${escapeHtml(String(editing?clientCategoryOrder(editing):all.length+1))}"></div>
  <label class="check-label"><input id="clientCategoryActive" type="checkbox" ${editing?clientCategoryActive(editing)?'checked':'':'checked'}> فعال ويظهر للعميل</label></div>
  <div class="category-actions"><button id="saveClientCategory" type="submit" class="primary-btn compact">${editing?'✓ حفظ التعديل':'＋ حفظ التصنيف'}</button><button id="cancelClientCategory" type="button" class="secondary-btn compact">إلغاء</button><span id="clientCategoryMessage" class="panel-note" aria-live="polite"></span></div></form></article>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>التصنيف</th><th>الصورة</th><th>الترجمة</th><th>الأيقونة</th><th>الحالة</th><th>الترتيب</th><th>الإجراءات</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><strong>${escapeHtml(clientCategoryName(r))}</strong><br><small class="muted-cell">ID ثابت: ${escapeHtml(String(r.id).slice(0,8))}…</small></td><td>${r.image_url?`<img src="${escapeHtml(r.image_url)}?admin_preview=${Date.now()}" alt="صورة ${escapeHtml(clientCategoryName(r))}" style="width:52px;height:52px;object-fit:cover;border-radius:14px;border:1px solid var(--border-color);">`:'—'}</td><td><small>${escapeHtml(r.name_ku||'—')} / ${escapeHtml(r.name_en||'—')}</small></td><td>${escapeHtml(r.icon||'—')}</td><td><span class="status-chip ${clientCategoryActive(r)?'status-ready':'status-cancelled'}">${clientCategoryActive(r)?'فعال':'موقوف'}</span></td><td>${clientCategoryOrder(r)}</td><td><div class="inline-actions wrap-actions"><button class="primary-btn tiny" data-client-category-edit="${escapeHtml(String(r.id))}">✏ تعديل</button><button class="secondary-btn tiny" data-client-category-toggle="${escapeHtml(String(r.id))}" data-active="${clientCategoryActive(r)?'1':'0'}">${clientCategoryActive(r)?'إيقاف':'تفعيل'}</button><button class="danger-btn tiny" data-client-category-delete="${escapeHtml(String(r.id))}">حذف</button></div></td></tr>`).join(''):`<tr><td colspan="7" class="muted-cell">لا توجد تصنيفات بعد. اضغط «إضافة تصنيف جديد».</td></tr>`}</tbody></table></div>`;
}
function openNewClientCategory(){ systemPageState.editingClientCategoryId='__new__'; renderSystemTab(); setTimeout(()=>document.getElementById('clientCategoryNameAr')?.focus(),30); }

async function uploadClientCategoryImage(){
  const fileInput=document.getElementById('clientCategoryImageFile');
  const urlInput=document.getElementById('clientCategoryImage');
  const msg=document.getElementById('clientCategoryMessage');
  const file=fileInput?.files?.[0];
  if(!file){if(msg)msg.textContent='اختر صورة من الجهاز أولًا.';return;}
  if(file.size>5*1024*1024){if(msg)msg.textContent='حجم الصورة يجب ألا يتجاوز 5 MB.';return;}
  const allowed=['image/png','image/jpeg','image/webp','image/gif'];
  if(!allowed.includes(file.type)){if(msg)msg.textContent='الصيغة غير مدعومة. استخدم PNG أو JPG أو WEBP أو GIF.';return;}
  if(msg)msg.textContent='جارٍ رفع الصورة...';
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){if(msg)msg.textContent='تعذر التحقق من حساب الإدارة. سجل الدخول من جديد.';return;}
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=`${user.id}/${Date.now()}_${Math.random().toString(36).slice(2,9)}.${ext}`;
  const {error:uploadError}=await supabase.storage.from('system-category-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(uploadError){if(msg)msg.textContent='تعذر رفع الصورة: '+uploadError.message;return;}
  const {data:publicData}=supabase.storage.from('system-category-images').getPublicUrl(path);
  const publicUrl=publicData?.publicUrl||'';
  if(!publicUrl){if(msg)msg.textContent='تم الرفع لكن تعذر إنشاء رابط الصورة.';return;}
  if(urlInput)urlInput.value=publicUrl;
  const holder=document.querySelector('.category-image-preview');
  if(holder){holder.innerHTML=`<img src="${escapeHtml(publicUrl)}?admin_preview=${Date.now()}" alt="صورة التصنيف">`;}

  // Stage 21: when editing an existing category, persist the new image URL immediately.
  // This removes the easy-to-miss second Save step and guarantees Client receives the new URL.
  const editId=systemPageState.editingClientCategoryId;
  if(editId && editId!=='__new__') {
    const {error:saveImageError}=await supabase.rpc('admin_update_system_category_image_v1',{p_id:editId,p_image_url:publicUrl});
    if(saveImageError){if(msg)msg.textContent='تم رفع الصورة، لكن تعذر حفظ رابطها: '+saveImageError.message;return;}
    if(msg)msg.textContent='تم رفع الصورة وحفظها للتصنيف ✓';
    await loadSystemData();
  } else if(msg) {
    msg.textContent='تم رفع الصورة ✓ وسيُحفظ رابطها عند حفظ التصنيف.';
  }
}

async function saveClientCategory(){
  const msg=document.getElementById('clientCategoryMessage');
  const nameAr=document.getElementById('clientCategoryNameAr')?.value.trim()||'';
  if(!nameAr){if(msg)msg.textContent='اكتب اسم التصنيف بالعربية.';return;}
  const args={p_name_ar:nameAr,p_name_ku:document.getElementById('clientCategoryNameKu')?.value.trim()||null,p_name_en:document.getElementById('clientCategoryNameEn')?.value.trim()||null,p_icon:document.getElementById('clientCategoryIcon')?.value.trim()||null,p_image_url:document.getElementById('clientCategoryImage')?.value.trim()||null,p_color_hex:document.getElementById('clientCategoryColor')?.value.trim()||'#FF7A00',p_sort_order:Math.max(1,Number(document.getElementById('clientCategoryOrder')?.value||1)),p_is_active:!!document.getElementById('clientCategoryActive')?.checked};
  if(msg)msg.textContent='جارٍ الحفظ...';
  const editId=systemPageState.editingClientCategoryId;
  const req=editId&&editId!=='__new__'?supabase.rpc('admin_update_system_category',{p_id:editId,...args}):supabase.rpc('admin_create_system_category',args);
  const {error}=await req;if(error){if(msg)msg.textContent='تعذر الحفظ: '+error.message;return;}
  await systemAudit(editId&&editId!=='__new__'?'edit_client_category':'create_client_category','system_category',editId||nameAr,{name_ar:nameAr,is_active:args.p_is_active,sort_order:args.p_sort_order});
  systemPageState.editingClientCategoryId=null;await loadSystemData();renderSystemTab();
}
async function toggleClientCategory(id,current){const {error}=await supabase.rpc('admin_set_system_category_active',{p_id:id,p_is_active:!current});if(error){alert('تعذر تحديث التصنيف: '+error.message);return;}await loadSystemData();renderSystemTab();}
async function deleteClientCategory(id){if(!confirm('حذف هذا التصنيف من واجهة العميل؟'))return;const {error}=await supabase.rpc('admin_delete_system_category',{p_id:id});if(error){alert('تعذر حذف التصنيف: '+error.message);return;}await loadSystemData();renderSystemTab();}
function wireClientCategories(){
  document.getElementById('newClientCategory')?.addEventListener('click',openNewClientCategory);
  document.getElementById('clientCategoryForm')?.addEventListener('submit',e=>{e.preventDefault();saveClientCategory();});
  document.getElementById('uploadClientCategoryImage')?.addEventListener('click',uploadClientCategoryImage);
  document.getElementById('cancelClientCategory')?.addEventListener('click',()=>{systemPageState.editingClientCategoryId=null;renderSystemTab();});
  document.getElementById('clientCategorySearch')?.addEventListener('input',e=>{systemPageState.clientCategorySearch=e.target.value;renderSystemTab();});
  document.getElementById('clientCategoryStatusFilter')?.addEventListener('change',e=>{systemPageState.clientCategoryStatusFilter=e.target.value;renderSystemTab();});
  document.getElementById('resetClientCategoryFilters')?.addEventListener('click',()=>{systemPageState.clientCategorySearch='';systemPageState.clientCategoryStatusFilter='all';renderSystemTab();});
  document.querySelectorAll('[data-client-category-edit]').forEach(b=>b.addEventListener('click',()=>{systemPageState.editingClientCategoryId=b.dataset.clientCategoryEdit;renderSystemTab();setTimeout(()=>{document.getElementById('clientCategoryEditor')?.scrollIntoView({behavior:'smooth',block:'start'});document.getElementById('clientCategoryNameAr')?.focus();},40);}));
  document.querySelectorAll('[data-client-category-toggle]').forEach(b=>b.addEventListener('click',()=>toggleClientCategory(b.dataset.clientCategoryToggle,b.dataset.active==='1')));
  document.querySelectorAll('[data-client-category-delete]').forEach(b=>b.addEventListener('click',()=>deleteClientCategory(b.dataset.clientCategoryDelete)));
}

function systemCategoryName(r){ return pick(r,['name','title','name_ar','category_name'],'قسم'); }
function systemCategoryActive(r){ return systemBool(pick(r,['is_active','active','enabled'],true)); }
function systemCategoryOrder(r){ return pick(r,['sort_order','position','order_index','display_order'],0); }
function filteredCategoryRows(){
  const q=String(systemPageState.categorySearch||'').trim().toLowerCase();
  const sf=systemPageState.categoryStoreFilter||'all';
  const st=systemPageState.categoryStatusFilter||'all';
  return systemPageState.categories.filter(r=>{
    const active=systemCategoryActive(r);
    const matchQ=!q||[systemCategoryName(r),systemStoreName(r.store_id)].join(' ').toLowerCase().includes(q);
    const matchStore=sf==='all'||String(r.store_id)===String(sf);
    const matchStatus=st==='all'||(st==='active'&&active)||(st==='paused'&&!active);
    return matchQ&&matchStore&&matchStatus;
  });
}
function renderSystemCategories() {
  if (!systemPageState.categoryTable) return `<section class="empty-state compact-empty"><div class="empty-icon">🗂</div><h3>لم نجد جدول أقسام قابلًا للقراءة</h3></section>`;
  const rows=filteredCategoryRows();
  const allRows=systemPageState.categories;
  const editing=allRows.find(r=>String(r.id)===String(systemPageState.editingCategoryId||''));
  const storeOptions=systemPageState.stores.map(s=>`<option value="${escapeHtml(String(s.id))}" ${editing&&String(editing.store_id)===String(s.id)?'selected':''}>${escapeHtml(s.name||systemShort(s.id))}</option>`).join('');
  const filterStoreOptions=systemPageState.stores.map(st=>`<option value="${escapeHtml(String(st.id))}" ${String(systemPageState.categoryStoreFilter)===String(st.id)?'selected':''}>${escapeHtml(st.name||systemShort(st.id))}</option>`).join('');
  const storeWarning = systemPageState.stores.length ? '' : `<div class="inline-alert warning">لم يتم تحميل أي متجر. اضغط تحديث البيانات بعد التأكد من تشغيل SQL الخاص بهذه النسخة.</div>`;
  return `${storeWarning}<div class="system-section-head"><div><h3>أقسام منتجات المتاجر</h3><p>إدارة الأقسام الداخلية لمنتجات كل متجر، مع بحث وفلاتر سريعة وتعديل مباشر.</p></div><span class="tag">${fmtNumber(rows.length)} من ${fmtNumber(allRows.length)} قسم</span></div>
  <section class="management-toolbar panel"><label class="search-box">🔎<input id="categorySearch" type="search" value="${escapeHtml(systemPageState.categorySearch||'')}" placeholder="ابحث باسم القسم أو المتجر..."></label><label>المتجر<select id="categoryStoreFilter"><option value="all">كل المتاجر</option>${filterStoreOptions}</select></label><label>الحالة<select id="categoryStatusFilter"><option value="all" ${systemPageState.categoryStatusFilter==='all'?'selected':''}>كل الحالات</option><option value="active" ${systemPageState.categoryStatusFilter==='active'?'selected':''}>فعال</option><option value="paused" ${systemPageState.categoryStatusFilter==='paused'?'selected':''}>موقوف</option></select></label><button type="button" class="secondary-btn compact" id="resetCategoryFilters">إعادة الضبط</button></section>
  <article class="panel category-editor"><div class="panel-head"><div><span>${editing?'تعديل القسم':'قسم جديد'}</span><h3>${editing?'تعديل قسم منتجات':'إضافة قسم منتجات'}</h3></div>${editing?'<span class="tag status-pending">وضع التعديل</span>':''}</div><form id="categoryCreateForm" class="category-create-form" autocomplete="off"><div class="settings-form-grid category-form-grid"><div class="category-field"><label for="categoryName">اسم القسم</label><input id="categoryName" name="categoryName" type="text" value="${escapeHtml(editing?systemCategoryName(editing):'')}" placeholder="مثال: البرغر"></div><div class="category-field"><label for="categoryStore">المتجر <span class="required-mark">*</span></label><select id="categoryStore" required><option value="" disabled ${editing?'':'selected'}>اختر متجرًا</option>${storeOptions}</select></div><div class="category-field"><label for="categoryOrder">الترتيب</label><input id="categoryOrder" type="number" value="${escapeHtml(String(editing?systemCategoryOrder(editing):0))}" min="0"></div><label class="check-label"><input id="categoryActive" type="checkbox" ${editing?systemCategoryActive(editing)?'checked':'':'checked'}> فعال</label></div><div class="category-actions"><button id="saveCategoryBtn" type="submit" class="primary-btn compact">${editing?'✓ حفظ التعديل':'＋ إضافة القسم'}</button>${editing?'<button id="cancelCategoryEdit" type="button" class="secondary-btn compact">إلغاء التعديل</button>':''}<span id="categoryMessage" class="panel-note" aria-live="polite"></span></div></form></article>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>القسم</th><th>المتجر</th><th>الحالة</th><th>الترتيب</th><th>الإجراءات</th></tr></thead><tbody>${rows.length ? rows.map(r=>`<tr><td><strong>${escapeHtml(systemCategoryName(r))}</strong></td><td>${escapeHtml(systemStoreName(r.store_id))}</td><td><span class="status-chip ${systemCategoryActive(r)?'status-ready':'status-cancelled'}">${systemCategoryActive(r)?'فعال':'موقوف'}</span></td><td>${escapeHtml(String(systemCategoryOrder(r)))}</td><td><div class="inline-actions wrap-actions"><button class="secondary-btn tiny" data-category-edit="${escapeHtml(String(r.id||''))}">تعديل</button><button class="secondary-btn tiny" data-category-toggle="${escapeHtml(String(r.id||''))}" data-category-active="${systemCategoryActive(r)?'1':'0'}">${systemCategoryActive(r)?'إيقاف':'تفعيل'}</button><button class="danger-btn tiny" data-category-delete="${escapeHtml(String(r.id||''))}">حذف</button></div></td></tr>`).join('') : `<tr><td colspan="5" class="muted-cell">لا توجد أقسام مطابقة للبحث والفلاتر الحالية.</td></tr>`}</tbody></table></div>`;
}
async function systemSaveCategory(){
  const name=document.getElementById('categoryName')?.value.trim();
  const storeId=document.getElementById('categoryStore')?.value||'';
  const sortOrder=Number(document.getElementById('categoryOrder')?.value||0);
  const active=!!document.getElementById('categoryActive')?.checked;
  const msg=document.getElementById('categoryMessage');
  if(!name){if(msg)msg.textContent='اكتب اسم القسم أولًا.';return;}
  if(!storeId){if(msg)msg.textContent='اختر المتجر أولًا.';return;}
  if(msg)msg.textContent='جارٍ الحفظ...';
  const id=systemPageState.editingCategoryId;
  const req=id?supabase.rpc('admin_update_product_category',{p_id:id,p_name:name,p_store_id:storeId,p_sort_order:sortOrder,p_is_active:active}):supabase.rpc('admin_create_product_category',{p_name:name,p_store_id:storeId,p_sort_order:sortOrder,p_is_active:active});
  const {error}=await req;
  if(error){if(msg)msg.textContent='تعذر الحفظ: '+error.message;return;}
  await systemAudit(id?'edit_category':'create_category','product_category',id||name,{store_id:storeId,sort_order:sortOrder,is_active:active});
  systemPageState.editingCategoryId=null;await loadSystemData();renderSystemTab();
}
async function systemToggleCategory(id,current){if(!id)return;const {error}=await supabase.rpc('admin_update_product_category',{p_id:id,p_name:null,p_store_id:null,p_sort_order:null,p_is_active:!current});if(error){alert('تعذر تحديث القسم: '+error.message);return;}await systemAudit('toggle_category','product_category',id,{is_active:!current});await loadSystemData();renderSystemTab();}
async function systemDeleteCategory(id){if(!id||!confirm('حذف هذا القسم؟'))return;const {error}=await supabase.rpc('admin_delete_product_category',{p_id:id});if(error){alert('تعذر حذف القسم: '+error.message);return;}await systemAudit('delete_category','product_category',id);await loadSystemData();renderSystemTab();}
function wireSystemCategories(){
  document.getElementById('categoryCreateForm')?.addEventListener('submit',e=>{e.preventDefault();systemSaveCategory();});
  document.getElementById('cancelCategoryEdit')?.addEventListener('click',()=>{systemPageState.editingCategoryId=null;renderSystemTab();});
  document.getElementById('categorySearch')?.addEventListener('input',e=>{systemPageState.categorySearch=e.target.value;renderSystemTab();setTimeout(()=>{const el=document.getElementById('categorySearch');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}},0);});
  document.getElementById('categoryStoreFilter')?.addEventListener('change',e=>{systemPageState.categoryStoreFilter=e.target.value;renderSystemTab();});
  document.getElementById('categoryStatusFilter')?.addEventListener('change',e=>{systemPageState.categoryStatusFilter=e.target.value;renderSystemTab();});
  document.getElementById('resetCategoryFilters')?.addEventListener('click',()=>{systemPageState.categorySearch='';systemPageState.categoryStoreFilter='all';systemPageState.categoryStatusFilter='all';renderSystemTab();});
  document.querySelectorAll('[data-category-edit]').forEach(b=>b.addEventListener('click',()=>{systemPageState.editingCategoryId=b.dataset.categoryEdit;renderSystemTab();setTimeout(()=>document.getElementById('categoryName')?.focus(),50);}));
  document.querySelectorAll('[data-category-toggle]').forEach(b=>b.addEventListener('click',()=>systemToggleCategory(b.dataset.categoryToggle,b.dataset.categoryActive==='1')));
  document.querySelectorAll('[data-category-delete]').forEach(b=>b.addEventListener('click',()=>systemDeleteCategory(b.dataset.categoryDelete)));
}
function offerActiveField(r){return ['is_active','active','enabled'].find(k=>Object.prototype.hasOwnProperty.call(r,k))||null;}
function offerStartValue(r){return pick(r,['starts_at','start_at','start_date','valid_from','starts_on'],'');}
function offerEndValue(r){return pick(r,['ends_at','end_at','end_date','valid_until','expires_at','expires_on'],'');}
function offerDiscountValue(r){return pick(r,['discount_value','discount_amount','value','percentage','percent'],'—');}
function offerStatusKey(r){
  const active=systemBool(pick(r,['is_active','active','enabled'],true));
  if(!active) return 'paused';
  const end=offerEndValue(r); if(end){const d=new Date(end);if(!Number.isNaN(d.getTime())&&d.getTime()<Date.now())return 'expired';}
  return 'active';
}
function offerStatusLabel(r){return ({active:'فعال',paused:'موقوف',expired:'منتهي'})[offerStatusKey(r)]||'فعال';}
function offerStatusClass(r){return ({active:'status-ready',paused:'status-cancelled',expired:'status-pending'})[offerStatusKey(r)]||'status-ready';}
function couponTitle(r){return pick(r,['code','coupon_code','name'],'—');}
function promoTitle(r){return pick(r,['title','name','description'],'عرض');}
function offerMatches(r,title){const q=String(systemPageState.offerSearch||'').trim().toLowerCase();if(!q)return true;return [title,systemStoreName(r.store_id),offerDiscountValue(r),offerStatusLabel(r)].join(' ').toLowerCase().includes(q);}
function filteredOfferRows(rows,titleFn){return rows.filter(r=>{const f=systemPageState.offerFilter||'all';return (f==='all'||offerStatusKey(r)===f)&&offerMatches(r,titleFn(r));});}
function offerDateLabel(v){if(!v)return '—';return fmtDate(v);}
function offerDetailsHtml(r,kind){
  const title=kind==='coupon'?couponTitle(r):promoTitle(r);
  return `<div class="details-grid offer-details-grid">${detailItem(kind==='coupon'?'الكود':'العرض',title)}${detailItem('المتجر',systemStoreName(r.store_id))}${detailItem('الخصم',offerDiscountValue(r))}${detailItem('الحالة',offerStatusLabel(r))}${detailItem('البداية',offerDateLabel(offerStartValue(r)))}${detailItem('النهاية',offerDateLabel(offerEndValue(r)))}</div><details class="raw-details"><summary>بيانات إضافية</summary><div class="raw-grid">${Object.entries(r).map(([k,v])=>detailItem(k,typeof v==='object'?JSON.stringify(v):v)).join('')}</div></details>`;
}
function openOfferDetails(r,kind){
  const overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='offerModal';
  overlay.innerHTML=`<section class="modal-card compact-modal"><div class="modal-head"><div><span class="pill">${kind==='coupon'?'كوبون':'عرض متجر'}</span><h2>${escapeHtml(kind==='coupon'?couponTitle(r):promoTitle(r))}</h2><p class="modal-subtitle">تفاصيل واضحة للإدارة بدون إظهار أسماء الجداول التقنية.</p></div><button class="icon-btn" id="closeOfferModal">✕</button></div>${offerDetailsHtml(r,kind)}</section>`;
  document.body.appendChild(overlay);const close=()=>overlay.remove();document.getElementById('closeOfferModal').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
}
async function toggleOffer(r,kind){
  const table=kind==='coupon'?systemPageState.couponTable:systemPageState.promotionTable;const field=offerActiveField(r);
  if(!table||!field){alert('هذا العنصر لا يحتوي حقل تفعيل يمكن تعديله.');return;}
  const next=!systemBool(r[field]);if(!confirm(`${next?'تفعيل':'إيقاف'} ${kind==='coupon'?'الكوبون':'العرض'}؟`))return;
  const {error}=await supabase.from(table).update({[field]:next}).eq('id',r.id);if(error){alert('تعذر تحديث الحالة: '+error.message);return;}
  await systemAudit(next?'activate_offer':'pause_offer',kind,r.id,{table});await loadSystemData();renderSystemTab();
}
async function deleteOffer(r,kind){
  const table=kind==='coupon'?systemPageState.couponTable:systemPageState.promotionTable;if(!table||!r.id)return;
  const name=kind==='coupon'?couponTitle(r):promoTitle(r);if(!confirm(`حذف ${kind==='coupon'?'الكوبون':'العرض'} "${name}"؟`))return;
  const {error}=await supabase.from(table).delete().eq('id',r.id);if(error){alert('تعذر الحذف: '+error.message);return;}
  await systemAudit('delete_offer',kind,r.id,{table,name});await loadSystemData();renderSystemTab();
}
async function editOffer(r,kind){
  const table=kind==='coupon'?systemPageState.couponTable:systemPageState.promotionTable;if(!table||!r.id)return;
  const payload={};
  const titleField=(kind==='coupon'?['code','coupon_code','name']:['title','name','description']).find(k=>Object.prototype.hasOwnProperty.call(r,k));
  const discountField=['discount_value','discount_amount','value','percentage','percent'].find(k=>Object.prototype.hasOwnProperty.call(r,k));
  const startField=['starts_at','start_at','start_date','valid_from','starts_on'].find(k=>Object.prototype.hasOwnProperty.call(r,k));
  const endField=['ends_at','end_at','end_date','valid_until','expires_at','expires_on'].find(k=>Object.prototype.hasOwnProperty.call(r,k));
  if(titleField){const v=prompt(kind==='coupon'?'كود / اسم الكوبون':'اسم العرض',String(r[titleField]??''));if(v===null)return;if(v.trim())payload[titleField]=v.trim();}
  if(discountField){const v=prompt('قيمة الخصم',String(r[discountField]??''));if(v===null)return;if(v.trim()!=='')payload[discountField]=v.trim();}
  if(startField){const v=prompt('بداية العرض / الكوبون (اتركه كما هو إذا لا تريد التغيير)',String(r[startField]??''));if(v===null)return;if(v.trim()!=='')payload[startField]=v.trim();}
  if(endField){const v=prompt('نهاية العرض / الكوبون (اتركه كما هو إذا لا تريد التغيير)',String(r[endField]??''));if(v===null)return;if(v.trim()!=='')payload[endField]=v.trim();}
  if(!Object.keys(payload).length){alert('لا توجد حقول قابلة للتعديل في هذا العنصر.');return;}
  if(!confirm('حفظ التعديلات؟'))return;
  const {error}=await supabase.from(table).update(payload).eq('id',r.id);if(error){alert('تعذر حفظ التعديل: '+error.message);return;}
  await systemAudit('edit_offer',kind,r.id,{table,fields:Object.keys(payload)});await loadSystemData();renderSystemTab();
}
function renderOfferActions(r,kind){const active=offerStatusKey(r)==='active';return `<div class="inline-actions wrap-actions offer-actions"><button class="secondary-btn tiny" data-offer-action="details" data-offer-kind="${kind}" data-offer-id="${escapeHtml(String(r.id||''))}">تفاصيل</button><button class="secondary-btn tiny" data-offer-action="edit" data-offer-kind="${kind}" data-offer-id="${escapeHtml(String(r.id||''))}">تعديل</button>${offerActiveField(r)?`<button class="secondary-btn tiny" data-offer-action="toggle" data-offer-kind="${kind}" data-offer-id="${escapeHtml(String(r.id||''))}">${active?'إيقاف':'تفعيل'}</button>`:''}<button class="danger-btn tiny" data-offer-action="delete" data-offer-kind="${kind}" data-offer-id="${escapeHtml(String(r.id||''))}">حذف</button></div>`;}

function platformCouponStatusKey(r){
  const active=systemBool(r.is_active);
  if(!active)return 'paused';
  const end=r.end_at||r.ends_at;if(end){const d=new Date(end);if(!Number.isNaN(d.getTime())&&d.getTime()<Date.now())return 'expired';}
  return 'active';
}
function platformCouponStatusLabel(r){return ({active:'فعال',paused:'موقوف',expired:'منتهي'})[platformCouponStatusKey(r)]||'فعال';}
function platformCouponStatusClass(r){return ({active:'status-ready',paused:'status-cancelled',expired:'status-pending'})[platformCouponStatusKey(r)]||'status-ready';}
function platformCouponUsageLabel(r){const used=Number(r.used_count||0);const limit=r.usage_limit==null?'∞':fmtNumber(r.usage_limit);return `${fmtNumber(used)} / ${limit}`;}
function platformCouponDiscountLabel(r){const v=fmtNumber(r.discount_value||0);return r.discount_type==='percentage'?`${v}%`:`${v} د.ع`;}
function platformCouponMatches(r){const q=String(systemPageState.offerSearch||'').trim().toLowerCase();if(!q)return true;return [r.code,r.title,platformCouponDiscountLabel(r),platformCouponStatusLabel(r)].join(' ').toLowerCase().includes(q);}
function filteredPlatformCoupons(){return systemPageState.platformCoupons.filter(r=>{const f=systemPageState.offerFilter||'all';return (f==='all'||platformCouponStatusKey(r)===f)&&platformCouponMatches(r);});}
function platformCouponFormHtml(){
  const r=systemPageState.platformCoupons.find(x=>String(x.id)===String(systemPageState.editingPlatformCouponId||''));
  const now=new Date();const month=new Date(now.getTime()+30*24*3600*1000);
  const dt=v=>{const d=v?new Date(v):null;if(!d||Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
  return `<article class="panel platform-coupon-editor simple-coupon-editor"><div class="panel-head"><div><span>عروض هلا طلب</span><h3>${r?'تعديل الكوبون':'إنشاء كوبون'}</h3><p class="panel-note">كوبون بسيط لكل المتاجر: اكتب الكود والخصم وعدد العملاء فقط، والباقي اختياري.</p></div>${r?'<span class="tag status-pending">تعديل</span>':''}</div>
  <form id="platformCouponForm"><div class="platform-coupon-grid simple-coupon-grid">
    <label>رمز الكوبون<input id="pcCode" required maxlength="32" value="${escapeHtml(r?.code||'')}" placeholder="مثال HALLA20"></label>
    <label>نوع الخصم<select id="pcDiscountType"><option value="percentage" ${r?.discount_type==='percentage'||!r?'selected':''}>نسبة مئوية</option><option value="fixed" ${r?.discount_type==='fixed'?'selected':''}>مبلغ ثابت</option></select></label>
    <label><span id="pcDiscountValueLabel">قيمة الخصم${r?.discount_type==='fixed'?' (د.ع)':' (%)'}</span><input id="pcDiscountValue" type="number" min="1" ${r?.discount_type==='fixed'?'step="1"':'max="100" step="1"'} required value="${escapeHtml(String(r?.discount_value??10))}"></label>
    <label>عدد العملاء المستفيدين<input id="pcUsageLimit" type="number" min="1" step="1" value="${escapeHtml(String(r?.usage_limit??20))}" required placeholder="مثال 20"></label>
    <label>الحد الأدنى للطلب <small>(اختياري)</small><input id="pcMinimumOrder" type="number" min="0" step="1" value="${escapeHtml(String(r?.minimum_order??0))}" placeholder="0 = بدون حد"></label>
    <label>البداية<input id="pcStartAt" type="datetime-local" value="${escapeHtml(dt(r?.start_at)||dt(now))}" required></label>
    <label>النهاية<input id="pcEndAt" type="datetime-local" value="${escapeHtml(dt(r?.end_at)||dt(month))}" required></label>
    <label class="check-card"><input id="pcFirstOrderOnly" type="checkbox" ${r?.first_order_only?'checked':''}><span><b>للعميل الجديد فقط</b><small>فعّله فقط إذا تريد العرض لأول طلب.</small></span></label>
    <input id="pcPerCustomer" type="hidden" value="1">
  </div>
  <div class="inline-actions"><button class="primary-btn compact" type="submit">${r?'✓ حفظ التعديل':'＋ إنشاء الكوبون'}</button>${r?'<button type="button" id="cancelPlatformCouponEdit" class="secondary-btn compact">إلغاء</button>':''}<span id="platformCouponMessage" class="panel-note"></span></div></form></article>`;
}
async function savePlatformCoupon(){
  const msg=document.getElementById('platformCouponMessage');const v=id=>document.getElementById(id)?.value;const id=systemPageState.editingPlatformCouponId;
  const code=(v('pcCode')||'').trim().toUpperCase();
  const params={p_code:code,p_title:`كوبون ${code}`,p_discount_type:v('pcDiscountType')||'percentage',p_discount_value:Number(v('pcDiscountValue')||0),p_minimum_order:Number(v('pcMinimumOrder')||0),p_max_discount:null,p_usage_limit:Number(v('pcUsageLimit')||0)||null,p_per_customer_limit:1,p_first_order_only:document.getElementById('pcFirstOrderOnly')?.checked===true,p_start_at:new Date(v('pcStartAt')).toISOString(),p_end_at:new Date(v('pcEndAt')).toISOString(),p_is_active:true};
  if(!params.p_code||params.p_discount_value<=0||!params.p_usage_limit){if(msg)msg.textContent='أكمل رمز الكوبون وقيمة الخصم وعدد العملاء المستفيدين.';return;}
  if(params.p_discount_type==='percentage' && params.p_discount_value>100){if(msg)msg.textContent='قيمة الخصم بالنسبة المئوية لازم تكون من 1 إلى 100 فقط. مثال: اكتب 20 حتى يكون الخصم 20٪.';return;}
  if(params.p_discount_type==='fixed' && params.p_discount_value<1){if(msg)msg.textContent='مبلغ الخصم لازم يكون أكبر من صفر.';return;}
  if(!Number.isInteger(params.p_usage_limit)||params.p_usage_limit<1){if(msg)msg.textContent='عدد العملاء المستفيدين لازم يكون رقم صحيح أكبر من صفر.';return;}
  params.p_per_customer_limit=1;
  if(new Date(params.p_end_at)<=new Date(params.p_start_at)){if(msg)msg.textContent='تاريخ النهاية لازم يكون بعد البداية.';return;}
  const rpc=id?'admin_update_platform_coupon_campaign':'admin_create_platform_coupon_campaign';if(id)params.p_campaign_id=id;
  if(msg)msg.textContent='جارٍ الحفظ...';
  const {error}=await supabase.rpc(rpc,params);
  if(error){
    // أحيانًا ترجع الواجهة خطأ بعد أن يكون الكوبون قد حُفظ فعليًا/تزامن مع المتاجر.
    // قبل إظهار رسالة فشل، نتحقق من السجل النهائي نفسه حتى لا نعطي الإدارة نتيجة خاطئة.
    let persisted=null;
    try{
      const check=await supabase.from('platform_coupon_campaigns').select('id,code,discount_type,discount_value,usage_limit,minimum_order,start_at,end_at,is_active').eq('code',params.p_code).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(!check.error&&check.data){
        const sameType=String(check.data.discount_type||'')===String(params.p_discount_type||'');
        const sameValue=Math.abs(Number(check.data.discount_value||0)-Number(params.p_discount_value||0))<0.0001;
        const sameLimit=Number(check.data.usage_limit||0)===Number(params.p_usage_limit||0);
        if(sameType&&sameValue&&sameLimit)persisted=check.data;
      }
    }catch(_e){}
    if(!persisted){
      if(msg){const em=String(error.message||'');msg.textContent=em.includes('INVALID_DISCOUNT_VALUE')?'قيمة الخصم غير صحيحة. إذا اخترت نسبة مئوية اكتب رقمًا من 1 إلى 100، وإذا اخترت مبلغًا ثابتًا اكتب المبلغ بالدينار.':em.includes('INVALID_USAGE_LIMIT')?'عدد العملاء المستفيدين لازم يكون أكبر من صفر.':em.includes('CAMPAIGN_CODE_EXISTS')?'رمز الكوبون مستخدم مسبقًا. اختر رمزًا آخر.':'تعذر حفظ الكوبون. لم يتم اعتماد العملية، جرّب مرة ثانية.';}
      return;
    }
  }
  await systemAudit(id?'edit_platform_coupon':'create_platform_coupon','platform_coupon',id||params.p_code,{code:params.p_code,usage_limit:params.p_usage_limit,first_order_only:params.p_first_order_only});
  systemPageState.editingPlatformCouponId=null;
  await loadSystemData();
  renderSystemTab();
  setTimeout(()=>{const success=document.getElementById('platformCouponMessage');if(success){success.textContent=id?'تم حفظ تعديل الكوبون بنجاح.':'تم إنشاء الكوبون وحفظه بنجاح.';success.classList.add('success-text');}},0);
}
async function togglePlatformCoupon(r){const {error}=await supabase.rpc('admin_set_platform_coupon_campaign_active',{p_campaign_id:r.id,p_is_active:!systemBool(r.is_active)});if(error)return alert('تعذر تحديث الكوبون: '+error.message);await systemAudit('toggle_platform_coupon','platform_coupon',r.id,{is_active:!systemBool(r.is_active)});await loadSystemData();renderSystemTab();}
async function deletePlatformCoupon(r){if(!confirm(`حذف كوبون هلا طلب "${r.code}"؟ سيُلغى من كل المتاجر.`))return;const {error}=await supabase.rpc('admin_delete_platform_coupon_campaign',{p_campaign_id:r.id});if(error)return alert('تعذر الحذف: '+error.message);await systemAudit('delete_platform_coupon','platform_coupon',r.id,{code:r.code});await loadSystemData();renderSystemTab();}
function platformCouponRowsHtml(rows){return rows.length?rows.map(r=>`<tr><td><strong>${escapeHtml(r.code||'—')}</strong><small class="table-subtitle">${escapeHtml(r.title||'')}</small></td><td><span class="status-chip status-ready">كل المتاجر</span></td><td><strong>${escapeHtml(platformCouponDiscountLabel(r))}</strong></td><td>${escapeHtml(platformCouponUsageLabel(r))}</td><td>${r.first_order_only?'عميل جديد / أول طلب':'كل العملاء'}</td><td><small>${escapeHtml(offerDateLabel(r.start_at))} → ${escapeHtml(offerDateLabel(r.end_at))}</small></td><td><span class="status-chip ${platformCouponStatusClass(r)}">${platformCouponStatusLabel(r)}</span></td><td><div class="inline-actions wrap-actions"><button class="secondary-btn tiny" data-pc-edit="${r.id}">تعديل</button><button class="secondary-btn tiny" data-pc-toggle="${r.id}">${systemBool(r.is_active)?'إيقاف':'تفعيل'}</button><button class="danger-btn tiny" data-pc-delete="${r.id}">حذف</button></div></td></tr>`).join(''):'<tr><td colspan="8" class="muted-cell">لا توجد كوبونات مركزية مطابقة.</td></tr>';}


function settlementStatusLabel(v){return ({pending:'بانتظار إكمال الطلب',payable:'مستحق للدفع',paid:'تم الدفع',void:'ملغي / لا يستحق'})[String(v||'pending')]||String(v||'—');}
function settlementStatusClass(v){return ({pending:'status-pending',payable:'status-ready',paid:'status-ready',void:'status-cancelled'})[String(v||'pending')]||'status-pending';}
function settlementRows(){const q=String(systemPageState.settlementSearch||'').trim().toLowerCase();const f=systemPageState.settlementFilter||'all';return (systemPageState.couponSettlements||[]).filter(r=>(f==='all'||String(r.settlement_status)===f)&&(!q||[r.order_number,r.store_name,systemStoreName(r.store_id),r.coupon_code].join(' ').toLowerCase().includes(q))).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));}
function settlementMoneySum(status){return (systemPageState.couponSettlements||[]).filter(r=>String(r.settlement_status)===status).reduce((n,r)=>n+Number(r.discount_amount||0),0);}
async function toggleSettlementPaid(r){const makePaid=String(r.settlement_status)!=='paid';const note=makePaid?prompt(`تأكيد دفع ${fmtMoney(r.discount_amount)} إلى ${r.store_name||systemStoreName(r.store_id)}. ملاحظة اختيارية:`,''):null;if(makePaid&&note===null)return;if(!makePaid&&!confirm('إلغاء علامة "تم الدفع" وإرجاعها إلى مستحق؟'))return;const {error}=await supabase.rpc('admin_set_platform_coupon_settlement_paid',{p_settlement_id:r.id,p_paid:makePaid,p_note:note||null});if(error){const m=String(error.message||'');return alert(m.includes('ORDER_NOT_DELIVERED')?'لا يمكن تعليمها مدفوعة قبل اكتمال/تسليم الطلب.':m.includes('CANCELLED_ORDER_NOT_PAYABLE')?'الطلب ملغي ولا توجد تسوية مستحقة.':'تعذر تحديث التسوية: '+m);}await systemAudit(makePaid?'pay_coupon_settlement':'reopen_coupon_settlement','coupon_settlement',r.id,{order_id:r.order_id,store_id:r.store_id,amount:r.discount_amount});await loadSystemData();renderSystemTab();}
function platformSettlementsHtml(){const rows=settlementRows();const due=settlementMoneySum('payable'),paid=settlementMoneySum('paid'),pending=settlementMoneySum('pending');return `<article class="panel coupon-settlements-panel"><div class="panel-head"><div><span>محاسبة هلا طلب</span><h3>تسويات كوبونات هلا طلب مع المتاجر</h3><p class="panel-note">تعرف لكل طلب أي متجر استلم الخصم وكم المبلغ الذي يجب تعويضه. الطلب الملغي لا يدخل بالمستحقات، والدفع يتاح بعد التسليم فقط.</p></div><span class="tag">${fmtNumber(rows.length)} سجل</span></div><div class="settlement-metrics"><div><span>مستحق للدفع</span><strong>${fmtMoney(due)}</strong></div><div><span>تم دفعه</span><strong>${fmtMoney(paid)}</strong></div><div><span>بانتظار التسليم</span><strong>${fmtMoney(pending)}</strong></div></div><div class="settlement-toolbar"><label class="search-box">🔎<input id="settlementSearch" type="search" value="${escapeHtml(systemPageState.settlementSearch||'')}" placeholder="رقم الطلب، المتجر أو الكوبون..."></label><select id="settlementFilter"><option value="all" ${systemPageState.settlementFilter==='all'?'selected':''}>كل الحالات</option><option value="payable" ${systemPageState.settlementFilter==='payable'?'selected':''}>مستحق للدفع</option><option value="paid" ${systemPageState.settlementFilter==='paid'?'selected':''}>تم الدفع</option><option value="pending" ${systemPageState.settlementFilter==='pending'?'selected':''}>بانتظار التسليم</option><option value="void" ${systemPageState.settlementFilter==='void'?'selected':''}>ملغي</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>الطلب</th><th>المتجر</th><th>الكوبون</th><th>خصم هلا طلب</th><th>إجمالي الطلب</th><th>حالة الطلب</th><th>التسوية</th><th>التاريخ</th><th>الإجراء</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><strong>#${escapeHtml(String(r.order_number||systemShort(r.order_id)))}</strong></td><td><strong>${escapeHtml(r.store_name||systemStoreName(r.store_id))}</strong></td><td>${escapeHtml(r.coupon_code||'—')}</td><td><strong>${fmtMoney(r.discount_amount||0)}</strong></td><td>${fmtMoney(r.order_total||0)}</td><td>${escapeHtml((typeof orderStatusLabel==='function'?orderStatusLabel(r.order_status):r.order_status)||'—')}</td><td><span class="status-chip ${settlementStatusClass(r.settlement_status)}">${settlementStatusLabel(r.settlement_status)}</span></td><td><small>${escapeHtml(offerDateLabel(r.created_at))}</small></td><td>${String(r.settlement_status)==='payable'?`<button class="primary-btn tiny" data-settlement-paid="${r.id}">تم الدفع</button>`:String(r.settlement_status)==='paid'?`<button class="secondary-btn tiny" data-settlement-paid="${r.id}">إلغاء علامة الدفع</button>`:'<span class="muted-cell">—</span>'}</td></tr>`).join(''):'<tr><td colspan="9" class="muted-cell">لا توجد تسويات كوبونات بعد.</td></tr>'}</tbody></table></div></article>`;}


function isAdminOwnedPromotion(r){return String(r?.source||'').toLowerCase()==='admin';}
function storeOwnedPromotions(){return systemPageState.promotions.filter(r=>!isAdminOwnedPromotion(r));}
function platformOfferMatches(r){const q=String(systemPageState.offerSearch||'').trim().toLowerCase();if(!q)return true;return [promoTitle(r),systemStoreName(r.store_id),offerDiscountValue(r),offerStatusLabel(r)].join(' ').toLowerCase().includes(q);}
function filteredPlatformOffers(){return (systemPageState.platformOffers||[]).filter(r=>{const f=systemPageState.offerFilter||'all';return (f==='all'||offerStatusKey(r)===f)&&platformOfferMatches(r);});}
function platformOfferFormHtml(){
  if(!systemPageState.promotionTable)return '';
  const r=(systemPageState.platformOffers||[]).find(x=>String(x.id)===String(systemPageState.editingPlatformOfferId||''));
  const now=new Date();const month=new Date(now.getTime()+30*24*3600*1000);
  const local=v=>{const d=v?new Date(v):null;if(!d||Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
  const opts=systemPageState.stores.map(st=>`<option value="${escapeHtml(String(st.id))}" ${r&&String(r.store_id)===String(st.id)?'selected':''}>${escapeHtml(st.name||systemShort(st.id))}</option>`).join('');
  return `<article class="panel platform-offer-editor"><div class="panel-head"><div><span>عروض هلا طلب</span><h3>${r?'تعديل عرض الإدارة':'إنشاء عرض من الإدارة'}</h3><p class="panel-note">العرض يبقى مملوكًا لهلا طلب، ويُطبّق على المتجر المحدد بدون أن يظهر لصاحب المتجر كعرض أنشأه بنفسه.</p></div>${r?'<span class="tag status-pending">تعديل</span>':''}</div>
  <form id="platformOfferForm"><div class="platform-coupon-grid">
    <label>المتجر<select id="poStore" required><option value="">اختر المتجر</option>${opts}</select></label>
    <label>اسم العرض<input id="poTitle" required maxlength="120" value="${escapeHtml(r?.title||'')}" placeholder="مثال خصم هلا طلب"></label>
    <label>نوع الخصم<select id="poDiscountType"><option value="percentage" ${r?.discount_type==='percentage'||!r?'selected':''}>نسبة مئوية</option><option value="fixed" ${r?.discount_type==='fixed'?'selected':''}>مبلغ ثابت</option></select></label>
    <label>قيمة الخصم<input id="poDiscountValue" type="number" min="1" step="1" required value="${escapeHtml(String(r?.discount_value??10))}"></label>
    <label>الحد الأدنى للطلب<input id="poMinimumOrder" type="number" min="0" step="1" value="${escapeHtml(String(r?.minimum_order??0))}"></label>
    <label>البداية<input id="poStartAt" type="datetime-local" required value="${escapeHtml(local(r?.start_at)||local(now))}"></label>
    <label>النهاية<input id="poEndAt" type="datetime-local" required value="${escapeHtml(local(r?.end_at)||local(month))}"></label>
    <label class="check-card"><input id="poActive" type="checkbox" ${r?.is_active===false?'':'checked'}><span><b>العرض فعال</b><small>يمكن إيقافه لاحقًا من القائمة.</small></span></label>
  </div><label class="full-field">وصف اختياري<textarea id="poDescription" rows="2" maxlength="500" placeholder="تفاصيل مختصرة للعرض">${escapeHtml(r?.description||'')}</textarea></label>
  <div class="inline-actions"><button class="primary-btn compact" type="submit">${r?'✓ حفظ التعديل':'＋ إنشاء العرض'}</button>${r?'<button type="button" id="cancelPlatformOfferEdit" class="secondary-btn compact">إلغاء</button>':''}<span id="platformOfferMessage" class="panel-note"></span></div></form></article>`;
}
async function savePlatformOffer(){
  const msg=document.getElementById('platformOfferMessage');const val=id=>document.getElementById(id)?.value;const id=systemPageState.editingPlatformOfferId;
  const payload={p_store_id:val('poStore')||null,p_title:(val('poTitle')||'').trim(),p_description:(val('poDescription')||'').trim()||null,p_discount_type:val('poDiscountType')||'percentage',p_discount_value:Number(val('poDiscountValue')||0),p_minimum_order:Number(val('poMinimumOrder')||0),p_start_at:new Date(val('poStartAt')).toISOString(),p_end_at:new Date(val('poEndAt')).toISOString(),p_is_active:document.getElementById('poActive')?.checked===true};
  if(!payload.p_store_id||!payload.p_title||payload.p_discount_value<=0){if(msg)msg.textContent='اختر المتجر واكتب اسم العرض وقيمة الخصم.';return;}
  if(payload.p_discount_type==='percentage'&&payload.p_discount_value>100){if(msg)msg.textContent='النسبة المئوية يجب أن تكون من 1 إلى 100.';return;}
  if(new Date(payload.p_end_at)<=new Date(payload.p_start_at)){if(msg)msg.textContent='تاريخ النهاية يجب أن يكون بعد البداية.';return;}
  const rpc=id?'admin_update_platform_offer':'admin_create_platform_offer';if(id)payload.p_offer_id=id;
  if(msg)msg.textContent='جارٍ الحفظ...';
  const {error}=await supabase.rpc(rpc,payload);
  if(error){if(msg)msg.textContent=String(error.message||'').includes('function')?'شغّل ملف Stage 38 SQL في Supabase مرة واحدة أولًا.':'تعذر حفظ العرض: '+error.message;return;}
  await systemAudit(id?'edit_platform_offer':'create_platform_offer','platform_offer',id||payload.p_title,{store_id:payload.p_store_id});
  systemPageState.editingPlatformOfferId=null;await loadSystemData();renderSystemTab();
}
async function togglePlatformOffer(r){const {error}=await supabase.rpc('admin_set_platform_offer_active',{p_offer_id:r.id,p_is_active:!systemBool(r.is_active)});if(error)return alert('تعذر تحديث العرض: '+error.message);await systemAudit('toggle_platform_offer','platform_offer',r.id,{is_active:!systemBool(r.is_active)});await loadSystemData();renderSystemTab();}
async function deletePlatformOffer(r){if(!confirm(`حذف عرض هلا طلب "${promoTitle(r)}"؟`))return;const {error}=await supabase.rpc('admin_delete_platform_offer',{p_offer_id:r.id});if(error)return alert('تعذر حذف العرض: '+error.message);await systemAudit('delete_platform_offer','platform_offer',r.id,{store_id:r.store_id});await loadSystemData();renderSystemTab();}
function platformOfferRowsHtml(rows){return rows.length?rows.map(r=>`<tr><td><strong>${escapeHtml(promoTitle(r))}</strong><small class="table-subtitle">هلا طلب / الإدارة</small></td><td>${escapeHtml(systemStoreName(r.store_id))}</td><td>${escapeHtml(String(offerDiscountValue(r)))}${String(r.discount_type)==='percentage'?'%':' د.ع'}</td><td><small>${escapeHtml(offerDateLabel(offerStartValue(r)))} → ${escapeHtml(offerDateLabel(offerEndValue(r)))}</small></td><td><span class="status-chip ${offerStatusClass(r)}">${offerStatusLabel(r)}</span></td><td><div class="inline-actions wrap-actions"><button class="secondary-btn tiny" data-po-edit="${r.id}">تعديل</button><button class="secondary-btn tiny" data-po-toggle="${r.id}">${offerStatusKey(r)==='active'?'إيقاف':'تفعيل'}</button><button class="danger-btn tiny" data-po-delete="${r.id}">حذف</button></div></td></tr>`).join(''):'<tr><td colspan="6" class="muted-cell">لا توجد عروض من الإدارة مطابقة.</td></tr>';}

function renderSystemOffers() {
  const platformRows=filteredPlatformCoupons();
  const platformOfferRows=filteredPlatformOffers();
  const couponRows=filteredOfferRows(systemPageState.coupons.filter(r=>!r.platform_campaign_id),couponTitle);
  const promoRows=filteredOfferRows(storeOwnedPromotions(),promoTitle);
  const total=platformRows.length+platformOfferRows.length+couponRows.length+promoRows.length;
  return `<div class="system-section-head offers-head"><div><h3>الكوبونات والعروض</h3><p>محتوى هلا طلب منفصل عن محتوى المتاجر: الإدارة تملك كوبوناتها وعروضها، والمتجر يملك ما أنشأه فقط.</p></div><span class="tag">${fmtNumber(total)} نتيجة</span></div>
  ${platformCouponFormHtml()}
  ${platformOfferFormHtml()}
  ${platformSettlementsHtml()}
  <section class="offers-toolbar panel"><label class="search-box">🔎<input id="offersSearch" type="search" value="${escapeHtml(systemPageState.offerSearch||'')}" placeholder="ابحث بالكود، العرض أو المتجر..."></label><div class="offer-filter-buttons"><button class="secondary-btn compact ${systemPageState.offerFilter==='all'?'active-filter':''}" data-offer-filter="all">الكل</button><button class="secondary-btn compact ${systemPageState.offerFilter==='active'?'active-filter':''}" data-offer-filter="active">فعال</button><button class="secondary-btn compact ${systemPageState.offerFilter==='paused'?'active-filter':''}" data-offer-filter="paused">موقوف</button><button class="secondary-btn compact ${systemPageState.offerFilter==='expired'?'active-filter':''}" data-offer-filter="expired">منتهي</button></div></section>
  <div class="offers-stack">
  <article class="panel platform-campaigns-panel"><div class="panel-head"><div><span>هلا طلب / الإدارة</span><h3>كوبونات هلا طلب</h3><p class="panel-note">مملوكة للإدارة وتُطبّق مركزيًا. النسخ المتزامنة لا تُعرض لصاحب المتجر ضمن كوبوناته.</p></div><span class="tag">${fmtNumber(platformRows.length)}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>الكود</th><th>النطاق</th><th>الخصم</th><th>العملاء المستفيدون</th><th>الأهلية</th><th>الفترة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${platformCouponRowsHtml(platformRows)}</tbody></table></div></article>
  <article class="panel platform-campaigns-panel"><div class="panel-head"><div><span>هلا طلب / الإدارة</span><h3>عروض هلا طلب</h3><p class="panel-note">عروض تنشئها الإدارة لمتجر محدد، وتبقى ملكيتها للإدارة.</p></div><span class="tag">${fmtNumber(platformOfferRows.length)}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>العرض</th><th>المتجر المستهدف</th><th>الخصم</th><th>الفترة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${platformOfferRowsHtml(platformOfferRows)}</tbody></table></div></article>
  <article class="panel"><div class="panel-head"><div><span>المتاجر</span><h3>كوبونات المتاجر</h3><p class="panel-note">يظهر هنا فقط ما أنشأه أصحاب المتاجر.</p></div><span class="tag">${fmtNumber(couponRows.length)}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>الكود</th><th>المتجر</th><th>الخصم</th><th>الفترة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${couponRows.length?couponRows.map(r=>`<tr><td><strong>${escapeHtml(couponTitle(r))}</strong></td><td>${escapeHtml(systemStoreName(r.store_id))}</td><td>${escapeHtml(String(offerDiscountValue(r)))}</td><td><small>${escapeHtml(offerDateLabel(offerStartValue(r)))} → ${escapeHtml(offerDateLabel(offerEndValue(r)))}</small></td><td><span class="status-chip ${offerStatusClass(r)}">${offerStatusLabel(r)}</span></td><td>${renderOfferActions(r,'coupon')}</td></tr>`).join(''):`<tr><td colspan="6" class="muted-cell">لا توجد كوبونات متجر مطابقة.</td></tr>`}</tbody></table></div></article>
  <article class="panel"><div class="panel-head"><div><span>المتاجر</span><h3>عروض المتاجر</h3><p class="panel-note">يظهر هنا فقط ما أنشأه أصحاب المتاجر.</p></div><span class="tag">${fmtNumber(promoRows.length)}</span></div>${systemPageState.promotionTable?`<div class="table-wrap"><table class="data-table"><thead><tr><th>العرض</th><th>المتجر</th><th>الخصم</th><th>الفترة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${promoRows.length?promoRows.map(r=>`<tr><td><strong>${escapeHtml(promoTitle(r))}</strong></td><td>${escapeHtml(systemStoreName(r.store_id))}</td><td>${escapeHtml(String(offerDiscountValue(r)))}</td><td><small>${escapeHtml(offerDateLabel(offerStartValue(r)))} → ${escapeHtml(offerDateLabel(offerEndValue(r)))}</small></td><td><span class="status-chip ${offerStatusClass(r)}">${offerStatusLabel(r)}</span></td><td>${renderOfferActions(r,'promotion')}</td></tr>`).join(''):`<tr><td colspan="6" class="muted-cell">لا توجد عروض متجر مطابقة.</td></tr>`}</tbody></table></div>`:`<div class="muted-cell system-pad">لا يوجد جدول عروض متاح حاليًا.</div>`}</article></div>`;
}
function findOfferRow(kind,id){const rows=kind==='coupon'?systemPageState.coupons:systemPageState.promotions;return rows.find(r=>String(r.id)===String(id));}
function wireSystemOffers(){
  document.getElementById('platformCouponForm')?.addEventListener('submit',e=>{e.preventDefault();savePlatformCoupon();});
  document.getElementById('cancelPlatformCouponEdit')?.addEventListener('click',()=>{systemPageState.editingPlatformCouponId=null;renderSystemTab();});
  document.getElementById('platformOfferForm')?.addEventListener('submit',e=>{e.preventDefault();savePlatformOffer();});
  document.getElementById('cancelPlatformOfferEdit')?.addEventListener('click',()=>{systemPageState.editingPlatformOfferId=null;renderSystemTab();});
  document.querySelectorAll('[data-po-edit]').forEach(b=>b.addEventListener('click',()=>{systemPageState.editingPlatformOfferId=b.dataset.poEdit;renderSystemTab();setTimeout(()=>document.getElementById('poTitle')?.focus(),40);}));
  document.querySelectorAll('[data-po-toggle]').forEach(b=>b.addEventListener('click',()=>{const r=(systemPageState.platformOffers||[]).find(x=>String(x.id)===String(b.dataset.poToggle));if(r)togglePlatformOffer(r);}));
  document.querySelectorAll('[data-po-delete]').forEach(b=>b.addEventListener('click',()=>{const r=(systemPageState.platformOffers||[]).find(x=>String(x.id)===String(b.dataset.poDelete));if(r)deletePlatformOffer(r);}));
  document.getElementById('pcDiscountType')?.addEventListener('change',e=>{const input=document.getElementById('pcDiscountValue');const label=document.getElementById('pcDiscountValueLabel');if(!input)return;const pct=e.target.value==='percentage';input.min='1';input.step='1';if(pct){input.max='100';if(Number(input.value)>100)input.value='10';}else{input.removeAttribute('max');if(Number(input.value)<=100)input.value='3000';}if(label)label.textContent=pct?'قيمة الخصم (%)':'قيمة الخصم (د.ع)';});
  document.querySelectorAll('[data-pc-edit]').forEach(b=>b.addEventListener('click',()=>{systemPageState.editingPlatformCouponId=b.dataset.pcEdit;renderSystemTab();setTimeout(()=>document.getElementById('pcCode')?.focus(),40);}));
  document.querySelectorAll('[data-pc-toggle]').forEach(b=>b.addEventListener('click',()=>{const r=systemPageState.platformCoupons.find(x=>String(x.id)===String(b.dataset.pcToggle));if(r)togglePlatformCoupon(r);}));
  document.querySelectorAll('[data-pc-delete]').forEach(b=>b.addEventListener('click',()=>{const r=systemPageState.platformCoupons.find(x=>String(x.id)===String(b.dataset.pcDelete));if(r)deletePlatformCoupon(r);}));
  document.getElementById('settlementSearch')?.addEventListener('input',e=>{systemPageState.settlementSearch=e.target.value;renderSystemTab();setTimeout(()=>document.getElementById('settlementSearch')?.focus(),0);});
  document.getElementById('settlementFilter')?.addEventListener('change',e=>{systemPageState.settlementFilter=e.target.value;renderSystemTab();});
  document.querySelectorAll('[data-settlement-paid]').forEach(b=>b.addEventListener('click',()=>{const r=(systemPageState.couponSettlements||[]).find(x=>String(x.id)===String(b.dataset.settlementPaid));if(r)toggleSettlementPaid(r);}));
  document.getElementById('offersSearch')?.addEventListener('input',e=>{systemPageState.offerSearch=e.target.value;renderSystemTab();setTimeout(()=>document.getElementById('offersSearch')?.focus(),0);});
  document.querySelectorAll('[data-offer-filter]').forEach(b=>b.addEventListener('click',()=>{systemPageState.offerFilter=b.dataset.offerFilter;renderSystemTab();}));
  document.querySelectorAll('[data-offer-action]').forEach(b=>b.addEventListener('click',async()=>{const r=findOfferRow(b.dataset.offerKind,b.dataset.offerId);if(!r)return;const a=b.dataset.offerAction;if(a==='details')openOfferDetails(r,b.dataset.offerKind);else if(a==='edit')await editOffer(r,b.dataset.offerKind);else if(a==='toggle')await toggleOffer(r,b.dataset.offerKind);else if(a==='delete')await deleteOffer(r,b.dataset.offerKind);}));
}
function financeStatusLabel(v){return ({active:'فعال',paused:'موقوف',expired:'منتهي',true:'فعال',false:'موقوف'})[String(v)]||String(v||'—');}
function financeMatchesStore(storeId){return systemPageState.financeStoreFilter==='all'||String(storeId)===String(systemPageState.financeStoreFilter);}
function financeMatchesSearch(r){const q=String(systemPageState.financeSearch||'').trim().toLowerCase();return !q||[systemStoreName(r.store_id),r.plan_name,r.note,r.commission_value].join(' ').toLowerCase().includes(q);}
function filteredCommissions(){return systemPageState.commissions.filter(r=>financeMatchesStore(r.store_id)&&financeMatchesSearch(r)&&(systemPageState.financeStatusFilter==='all'||(systemPageState.financeStatusFilter==='active'&&r.is_active)||(systemPageState.financeStatusFilter==='paused'&&!r.is_active)));}
function filteredSubscriptions(){return systemPageState.subscriptions.filter(r=>financeMatchesStore(r.store_id)&&financeMatchesSearch(r)&&(systemPageState.financeStatusFilter==='all'||String(r.status||'active')===systemPageState.financeStatusFilter));}
function renderSystemFinance() {
  const editC=systemPageState.commissions.find(r=>String(r.id)===String(systemPageState.editingCommissionId||''));
  const editS=systemPageState.subscriptions.find(r=>String(r.id)===String(systemPageState.editingSubscriptionId||''));
  const storeOptionsFor=(selected)=>systemPageState.stores.map(s=>`<option value="${escapeHtml(String(s.id))}" ${selected&&String(selected)===String(s.id)?'selected':''}>${escapeHtml(s.name||systemShort(s.id))}</option>`).join('');
  const filterStores=systemPageState.stores.map(s=>`<option value="${escapeHtml(String(s.id))}" ${String(systemPageState.financeStoreFilter)===String(s.id)?'selected':''}>${escapeHtml(s.name||systemShort(s.id))}</option>`).join('');
  const commissionRows=filteredCommissions();const subscriptionRows=filteredSubscriptions();
  return `<div class="inline-alert info polish4-future-note"><b>العمولات والاشتراكات</b><span>إدارة قواعد العمولة واشتراكات المتاجر مع بحث وفلاتر وتعديل مباشر.</span></div>
  <section class="management-toolbar panel"><label class="search-box">🔎<input id="financeSearch" type="search" value="${escapeHtml(systemPageState.financeSearch||'')}" placeholder="ابحث باسم المتجر أو الخطة..."></label><label>المتجر<select id="financeStoreFilter"><option value="all">كل المتاجر</option>${filterStores}</select></label><label>الحالة<select id="financeStatusFilter"><option value="all" ${systemPageState.financeStatusFilter==='all'?'selected':''}>كل الحالات</option><option value="active" ${systemPageState.financeStatusFilter==='active'?'selected':''}>فعال</option><option value="paused" ${systemPageState.financeStatusFilter==='paused'?'selected':''}>موقوف</option><option value="expired" ${systemPageState.financeStatusFilter==='expired'?'selected':''}>منتهي</option></select></label><button id="resetFinanceFilters" type="button" class="secondary-btn compact">إعادة الضبط</button></section>
  <div class="finance-admin-grid">
    <article class="panel finance-editor"><div class="panel-head"><div><span>${editC?'تعديل قاعدة':'قاعدة جديدة'}</span><h3>${editC?'تعديل قاعدة عمولة':'إضافة قاعدة عمولة'}</h3></div>${editC?'<span class="tag status-pending">وضع التعديل</span>':''}</div><form id="commissionForm"><div class="settings-form-grid"><label>المتجر<select id="commissionStore" required><option value="">اختر متجرًا</option>${storeOptionsFor(editC?.store_id)}</select></label><label>نوع العمولة<select id="commissionType"><option value="percent" ${editC?.commission_type==='percent'?'selected':''}>نسبة مئوية</option><option value="fixed" ${editC?.commission_type==='fixed'?'selected':''}>مبلغ ثابت</option></select></label><label>القيمة<input id="commissionValue" type="number" min="0" step="0.01" value="${escapeHtml(String(editC?.commission_value??0))}" required></label><label>الحالة<select id="commissionActive"><option value="true" ${editC?.is_active!==false?'selected':''}>فعال</option><option value="false" ${editC?.is_active===false?'selected':''}>متوقف</option></select></label><label class="wide-field">ملاحظة<input id="commissionNote" type="text" value="${escapeHtml(editC?.note||'')}" placeholder="ملاحظة داخلية اختيارية"></label></div><div class="inline-actions"><button class="primary-btn compact" type="submit">${editC?'✓ حفظ التعديل':'＋ إضافة قاعدة العمولة'}</button>${editC?'<button id="cancelCommissionEdit" class="secondary-btn compact" type="button">إلغاء التعديل</button>':''}<span id="commissionMessage" class="panel-note"></span></div></form></article>
    <article class="panel finance-editor"><div class="panel-head"><div><span>${editS?'تعديل اشتراك':'اشتراك جديد'}</span><h3>${editS?'تعديل اشتراك متجر':'إضافة اشتراك متجر'}</h3></div>${editS?'<span class="tag status-pending">وضع التعديل</span>':''}</div><form id="subscriptionForm"><div class="settings-form-grid"><label>المتجر<select id="subscriptionStore" required><option value="">اختر متجرًا</option>${storeOptionsFor(editS?.store_id)}</select></label><label>اسم الخطة<input id="subscriptionPlan" type="text" value="${escapeHtml(editS?.plan_name||'شهري')}" required></label><label>القيمة<input id="subscriptionAmount" type="number" min="0" step="1" value="${escapeHtml(String(editS?.amount??0))}" required></label><label>الحالة<select id="subscriptionStatus"><option value="active" ${editS?.status==='active'||!editS?'selected':''}>فعال</option><option value="paused" ${editS?.status==='paused'?'selected':''}>متوقف</option><option value="expired" ${editS?.status==='expired'?'selected':''}>منتهي</option></select></label><label>تاريخ البداية<input id="subscriptionStart" type="date" value="${escapeHtml(String(editS?.starts_at||'').slice(0,10))}"></label><label>تاريخ النهاية<input id="subscriptionEnd" type="date" value="${escapeHtml(String(editS?.ends_at||'').slice(0,10))}"></label><label class="wide-field">ملاحظات<input id="subscriptionNote" type="text" value="${escapeHtml(editS?.note||'')}" placeholder="ملاحظات اختيارية"></label></div><div class="inline-actions"><button class="primary-btn compact" type="submit">${editS?'✓ حفظ التعديل':'＋ إضافة الاشتراك'}</button>${editS?'<button id="cancelSubscriptionEdit" class="secondary-btn compact" type="button">إلغاء التعديل</button>':''}<span id="subscriptionMessage" class="panel-note"></span></div></form></article>
  </div>
  <div class="finance-lists-grid"><article class="panel"><div class="panel-head"><div><span>العمولات</span><h3>قواعد العمولة</h3></div><span class="tag">${fmtNumber(commissionRows.length)} من ${fmtNumber(systemPageState.commissions.length)}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>المتجر</th><th>نوع العمولة</th><th>القيمة / النسبة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${commissionRows.length?commissionRows.map(r=>`<tr><td><strong>${escapeHtml(systemStoreName(r.store_id))}</strong></td><td>${r.commission_type==='fixed'?'مبلغ ثابت':'نسبة مئوية'}</td><td><strong>${fmtNumber(r.commission_value)}${r.commission_type==='fixed'?' د.ع':'%'}</strong></td><td><span class="status-chip ${r.is_active?'status-ready':'status-cancelled'}">${r.is_active?'فعال':'موقوف'}</span></td><td><div class="inline-actions wrap-actions"><button class="secondary-btn tiny" data-commission-edit="${r.id}">تعديل</button><button class="secondary-btn tiny" data-commission-toggle="${r.id}" data-active="${r.is_active?'1':'0'}">${r.is_active?'إيقاف':'تفعيل'}</button><button class="danger-btn tiny" data-commission-delete="${r.id}">حذف</button></div></td></tr>`).join(''):'<tr><td colspan="5" class="muted-cell">لا توجد قواعد مطابقة.</td></tr>'}</tbody></table></div></article>
  <article class="panel"><div class="panel-head"><div><span>الاشتراكات</span><h3>اشتراكات المتاجر</h3></div><span class="tag">${fmtNumber(subscriptionRows.length)} من ${fmtNumber(systemPageState.subscriptions.length)}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>المتجر</th><th>الخطة</th><th>القيمة</th><th>البداية</th><th>النهاية</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${subscriptionRows.length?subscriptionRows.map(r=>`<tr><td><strong>${escapeHtml(systemStoreName(r.store_id))}</strong></td><td>${escapeHtml(r.plan_name||'خطة')}</td><td><strong>${fmtMoney(r.amount||0)}</strong></td><td>${r.starts_at?fmtDate(r.starts_at):'—'}</td><td>${r.ends_at?fmtDate(r.ends_at):'—'}</td><td><span class="status-chip ${r.status==='active'?'status-ready':r.status==='expired'?'status-pending':'status-cancelled'}">${financeStatusLabel(r.status||'active')}</span></td><td><div class="inline-actions wrap-actions"><button class="secondary-btn tiny" data-subscription-edit="${r.id}">تعديل</button><button class="secondary-btn tiny" data-subscription-pause="${r.id}" data-status="${escapeHtml(r.status||'active')}">${r.status==='paused'?'تفعيل':'إيقاف'}</button><button class="danger-btn tiny" data-subscription-delete="${r.id}">حذف</button></div></td></tr>`).join(''):'<tr><td colspan="7" class="muted-cell">لا توجد اشتراكات مطابقة.</td></tr>'}</tbody></table></div></article></div>`;
}
async function systemSaveCommission(){const store_id=document.getElementById('commissionStore')?.value;const commission_type=document.getElementById('commissionType')?.value||'percent';const commission_value=Number(document.getElementById('commissionValue')?.value||0);const is_active=document.getElementById('commissionActive')?.value==='true';const note=document.getElementById('commissionNote')?.value.trim()||null;const msg=document.getElementById('commissionMessage');if(!store_id)return msg&&(msg.textContent='اختر متجرًا.');const id=systemPageState.editingCommissionId;const q=id?supabase.from('admin_commission_rules').update({store_id,commission_type,commission_value,is_active,note,updated_at:new Date().toISOString()}).eq('id',id).select().single():supabase.from('admin_commission_rules').insert({store_id,commission_type,commission_value,is_active,note}).select().single();const {data,error}=await q;if(error){if(msg)msg.textContent='تعذر الحفظ: '+error.message;return;}await systemAudit(id?'edit_commission':'create_commission','commission_rule',data?.id||id,{store_id,commission_type,commission_value});systemPageState.editingCommissionId=null;await loadSystemData();renderSystemTab();}
async function systemToggleCommission(id,current){const {error}=await supabase.from('admin_commission_rules').update({is_active:!current,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert('تعذر تحديث العمولة: '+error.message);await systemAudit('toggle_commission','commission_rule',id,{is_active:!current});await loadSystemData();renderSystemTab();}
async function systemDeleteCommission(id){if(!confirm('حذف قاعدة العمولة؟'))return;const {error}=await supabase.from('admin_commission_rules').delete().eq('id',id);if(error)return alert('تعذر الحذف: '+error.message);await systemAudit('delete_commission','commission_rule',id);await loadSystemData();renderSystemTab();}
async function systemSaveSubscription(){const store_id=document.getElementById('subscriptionStore')?.value;const plan_name=document.getElementById('subscriptionPlan')?.value.trim();const amount=Number(document.getElementById('subscriptionAmount')?.value||0);const status=document.getElementById('subscriptionStatus')?.value||'active';const starts_at=document.getElementById('subscriptionStart')?.value||null;const ends_at=document.getElementById('subscriptionEnd')?.value||null;const note=document.getElementById('subscriptionNote')?.value.trim()||null;const msg=document.getElementById('subscriptionMessage');if(!store_id||!plan_name)return msg&&(msg.textContent='اختر المتجر واكتب اسم الخطة.');const id=systemPageState.editingSubscriptionId;const payload={store_id,plan_name,amount,status,starts_at,ends_at,note};if(id)payload.updated_at=new Date().toISOString();const q=id?supabase.from('admin_subscriptions').update(payload).eq('id',id).select().single():supabase.from('admin_subscriptions').insert(payload).select().single();const {data,error}=await q;if(error){if(msg)msg.textContent='تعذر الحفظ: '+error.message;return;}await systemAudit(id?'edit_subscription':'create_subscription','subscription',data?.id||id,{store_id,plan_name,amount,status});systemPageState.editingSubscriptionId=null;await loadSystemData();renderSystemTab();}
async function systemToggleSubscription(id,status){const next=status==='paused'?'active':'paused';const {error}=await supabase.from('admin_subscriptions').update({status:next,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert('تعذر تحديث الاشتراك: '+error.message);await systemAudit('toggle_subscription','subscription',id,{status:next});await loadSystemData();renderSystemTab();}
async function systemDeleteSubscription(id){if(!confirm('حذف الاشتراك؟'))return;const {error}=await supabase.from('admin_subscriptions').delete().eq('id',id);if(error)return alert('تعذر الحذف: '+error.message);await systemAudit('delete_subscription','subscription',id);await loadSystemData();renderSystemTab();}
function wireSystemFinance(){
  document.getElementById('commissionForm')?.addEventListener('submit',e=>{e.preventDefault();systemSaveCommission();});document.getElementById('subscriptionForm')?.addEventListener('submit',e=>{e.preventDefault();systemSaveSubscription();});
  document.getElementById('cancelCommissionEdit')?.addEventListener('click',()=>{systemPageState.editingCommissionId=null;renderSystemTab();});document.getElementById('cancelSubscriptionEdit')?.addEventListener('click',()=>{systemPageState.editingSubscriptionId=null;renderSystemTab();});
  document.getElementById('financeSearch')?.addEventListener('input',e=>{systemPageState.financeSearch=e.target.value;renderSystemTab();setTimeout(()=>{const el=document.getElementById('financeSearch');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}},0);});document.getElementById('financeStoreFilter')?.addEventListener('change',e=>{systemPageState.financeStoreFilter=e.target.value;renderSystemTab();});document.getElementById('financeStatusFilter')?.addEventListener('change',e=>{systemPageState.financeStatusFilter=e.target.value;renderSystemTab();});document.getElementById('resetFinanceFilters')?.addEventListener('click',()=>{systemPageState.financeSearch='';systemPageState.financeStoreFilter='all';systemPageState.financeStatusFilter='all';renderSystemTab();});
  document.querySelectorAll('[data-commission-edit]').forEach(b=>b.addEventListener('click',()=>{systemPageState.editingCommissionId=b.dataset.commissionEdit;renderSystemTab();}));document.querySelectorAll('[data-commission-toggle]').forEach(b=>b.addEventListener('click',()=>systemToggleCommission(b.dataset.commissionToggle,b.dataset.active==='1')));document.querySelectorAll('[data-commission-delete]').forEach(b=>b.addEventListener('click',()=>systemDeleteCommission(b.dataset.commissionDelete)));
  document.querySelectorAll('[data-subscription-edit]').forEach(b=>b.addEventListener('click',()=>{systemPageState.editingSubscriptionId=b.dataset.subscriptionEdit;renderSystemTab();}));document.querySelectorAll('[data-subscription-pause]').forEach(b=>b.addEventListener('click',()=>systemToggleSubscription(b.dataset.subscriptionPause,b.dataset.status)));document.querySelectorAll('[data-subscription-delete]').forEach(b=>b.addEventListener('click',()=>systemDeleteSubscription(b.dataset.subscriptionDelete)));
}

async function refreshSupportRealtimeUi() {
  try {
    await Promise.all([loadSystemData(), loadAdminNotifications()]);
    if (['support','pin-customers','pin-partners'].includes(systemPageState.tab) && document.getElementById('systemTabContent')) {
      renderSystemTab();
    }
    if (document.getElementById('adminNotificationPanel')) renderNotificationPanel();
    const modal=document.getElementById('supportConversationModal');
    if (modal) {
      const source=modal.dataset.supportSource||'';
      const id=modal.dataset.supportConversationId||'';
      const found=supportConversationSource(id,source);
      if(found.row){
        const messages=await loadSupportConversationMessages(found.source,found.row);
        const list=document.getElementById('supportMessageList');
        if(list){
          list.innerHTML=renderSupportMessageRows(messages,found.source,found.row);
          list.scrollTop=list.scrollHeight;
        }
      }
    }
  } catch (e) {
    console.warn('Support realtime refresh failed:', e?.message||e);
  }
}
function scheduleSupportRealtimeRefresh(){
  clearTimeout(systemSupportRealtimeTimer);
  systemSupportRealtimeTimer=setTimeout(refreshSupportRealtimeUi,120);
}
function startSystemSupportRealtimeSafetyRefresh(){
  clearInterval(systemSupportRealtimeSafetyTimer);
  // Safety net only: Realtime remains the primary path. This makes PIN requests
  // appear automatically even after a temporary websocket/network interruption.
  systemSupportRealtimeSafetyTimer=setInterval(()=>{
    if(document.visibilityState==='visible') refreshSupportRealtimeUi();
  },12000);
}
function scheduleSystemSupportRealtimeReconnect(){
  clearTimeout(systemSupportRealtimeRetryTimer);
  systemSupportRealtimeRetryTimer=setTimeout(()=>startSystemSupportRealtime(),2500);
}
async function startSystemSupportRealtime(){
  if(!supabase)return;
  clearTimeout(systemSupportRealtimeRetryTimer);
  if(systemSupportRealtimeChannel){
    try{await supabase.removeChannel(systemSupportRealtimeChannel);}catch(_){ }
    systemSupportRealtimeChannel=null;
  }
  systemSupportRealtimeStatus='connecting';
  systemSupportRealtimeChannel=supabase
    .channel('admin-support-realtime')
    .on('postgres_changes',{event:'*',schema:'public',table:'customer_support_conversations'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'customer_support_messages'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'partner_support_tickets'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'partner_support_messages'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'phone_pin_reset_requests'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'stores'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'admin_store_reviews'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'partner_profiles'},scheduleSupportRealtimeRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'admin_driver_reviews'},scheduleSupportRealtimeRefresh)
    .subscribe((status)=>{
      systemSupportRealtimeStatus=String(status||'').toLowerCase();
      if(status==='SUBSCRIBED'){
        refreshSupportRealtimeUi();
        startSystemSupportRealtimeSafetyRefresh();
      }else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){
        scheduleSystemSupportRealtimeReconnect();
      }
    });
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){
    refreshSupportRealtimeUi();
    if(!['subscribed','connecting'].includes(systemSupportRealtimeStatus)) startSystemSupportRealtime();
  }
});
window.addEventListener('online',()=>{
  refreshSupportRealtimeUi();
  startSystemSupportRealtime();
});
function renderSupportMessageRows(messages,source,conversation){
  const defaultRole=source==='partner'?supportActorLabel(pick(conversation,['partner_type','role','sender_role'],'partner'),'الشريك'):'العميل';
  const sorted=[...(messages||[])].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  return sorted.length?sorted.map(m=>{const actor=supportActorLabel(m.role,defaultRole);const isAdmin=actor==='الإدارة';return `<div class="support-message-row ${isAdmin?'admin':'customer'}"><strong>${escapeHtml(actor)}</strong><p>${escapeHtml(m.text||'—')}</p><small>${fmtDate(m.created_at)}</small></div>`;}).join(''):'<div class="muted-cell">لا توجد رسائل داخل هذه المحادثة.</div>';
}

function supportActorLabel(role, fallback='المستخدم') {
  const v=String(role||'').toLowerCase();
  if(['admin','support','management'].includes(v)) return 'الإدارة';
  if(['business','store','store_owner','merchant'].includes(v)) return 'المتجر';
  if(['driver','courier'].includes(v)) return 'السائق';
  if(['customer','client','user'].includes(v)) return 'العميل';
  return fallback;
}
function supportConversationSource(id, requestedSource='') {
  if(requestedSource==='partner') return {source:'partner',row:systemPageState.partnerSupport.find(r=>String(r.id)===String(id))};
  if(requestedSource==='customer') return {source:'customer',row:systemPageState.support.find(r=>String(r.id)===String(id))};
  const customer=systemPageState.support.find(r=>String(r.id)===String(id));
  return customer?{source:'customer',row:customer}:{source:'partner',row:systemPageState.partnerSupport.find(r=>String(r.id)===String(id))};
}
async function loadSupportConversationMessages(source, conversation) {
  if(source==='customer') {
    const {data,error}=await supabase.from('customer_support_messages').select('*').eq('conversation_id',conversation.id).order('created_at',{ascending:true});
    if(error) throw new Error(error.message);
    return (data||[]).map(m=>({role:pick(m,['sender_type','sender_role'],'customer'),text:pick(m,['message','body','text'],'—'),created_at:pick(m,['created_at','sent_at'],null)}));
  }
  const seed=[];
  const firstText=pick(conversation,['message','body','description','details','content'],'');
  if(firstText) seed.push({role:pick(conversation,['partner_type','role','sender_role','type'],'partner'),text:firstText,created_at:pick(conversation,['created_at'],null)});
  try {
    const {data,error}=await supabase.from('partner_support_messages').select('*').eq('ticket_id',conversation.id).order('created_at',{ascending:true});
    if(!error && data?.length) return [...seed,...data.map(m=>({role:pick(m,['sender_role','sender_type','role'],'partner'),text:pick(m,['message','body','text'],'—'),created_at:pick(m,['created_at','sent_at'],null)}))];
  } catch (_) {}
  const adminReply=pick(conversation,['admin_reply','reply','response','admin_response'],'');
  if(adminReply) seed.push({role:'admin',text:adminReply,created_at:pick(conversation,['admin_replied_at','updated_at'],null)});
  return seed;
}
async function sendAdminSupportReply(source, conversation, text) {
  const clean=String(text||'').trim();
  if(!clean) throw new Error('اكتب الرد أولًا.');
  const {data:{user}}=await supabase.auth.getUser();
  if(source==='customer') {
    const payload={conversation_id:conversation.id,sender_type:'support',message:clean};
    if(user?.id) payload.sender_id=user.id;
    let {error}=await supabase.from('customer_support_messages').insert(payload);
    if(error && /sender_id|column/i.test(error.message||'')) {
      delete payload.sender_id;
      ({error}=await supabase.from('customer_support_messages').insert(payload));
    }
    if(error) throw new Error(error.message);
    await supabase.from(systemPageState.supportTable||'customer_support_conversations').update({status:'in_progress',updated_at:new Date().toISOString()}).eq('id',conversation.id);
    return;
  }
  // Stage 18 SQL adds a message table for store/driver support and keeps a latest-reply mirror on the ticket.
  const messagePayload={ticket_id:conversation.id,sender_role:'admin',message:clean};
  if(user?.id) messagePayload.sender_id=user.id;
  const {error:msgError}=await supabase.from('partner_support_messages').insert(messagePayload);
  if(msgError) throw new Error(msgError.message+' — شغّل admin_stage18_support_replies.sql مرة واحدة في Supabase.');
  const update={admin_reply:clean,admin_replied_at:new Date().toISOString(),status:'in_progress',updated_at:new Date().toISOString()};
  const {error:updateError}=await supabase.from('partner_support_tickets').update(update).eq('id',conversation.id);
  if(updateError) console.warn('تم حفظ الرد في سجل الرسائل لكن تعذر تحديث ملخص التذكرة:',updateError.message);
}
async function markAdminSupportRead(source, conversationId) {
  if(!conversationId) return;
  try {
    await supabase.rpc('admin_mark_support_ticket_read_v1',{p_source:source==='partner'?'partner':'customer',p_id:conversationId});
    await loadAdminNotifications();
  } catch(e) { console.warn('Mark support read failed:',e?.message||e); }
}
async function openSupportConversation(conversationId, requestedSource='') {
  if(!conversationId) return;
  const found=supportConversationSource(conversationId,requestedSource);const conversation=found.row;const source=found.source;
  if(!conversation){alert('تعذر العثور على التذكرة.');return;}
  await markAdminSupportRead(source,conversation.id);
  let messages=[];try{messages=await loadSupportConversationMessages(source,conversation);}catch(e){alert('تعذر فتح رسائل الدعم: '+e.message);return;}
  const overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='supportConversationModal';
  const subject=pick(conversation,['subject_ar','subject','subject_en','title'],'محادثة دعم');
  overlay.dataset.supportSource=source;
  overlay.dataset.supportConversationId=String(conversation.id||'');
  overlay.innerHTML=`<section class="modal-card support-modal"><div class="modal-head"><div><span class="pill">${source==='partner'?'دعم المتجر / السائق':'دعم العميل'}</span><h2>${escapeHtml(subject)}</h2><p class="modal-subtitle">المحادثة تتحدث تلقائيًا عند وصول أي رسالة جديدة.</p></div><button class="icon-btn" id="closeSupportModal">✕</button></div><div class="support-message-list" id="supportMessageList">${renderSupportMessageRows(messages,source,conversation)}</div><form id="supportReplyForm" class="support-reply-composer"><label>رد الإدارة<textarea id="supportReplyText" rows="4" maxlength="2000" placeholder="اكتب الرد هنا..." required></textarea></label><div class="support-reply-actions"><span id="supportReplyMessage" class="panel-note"></span><button class="primary-btn compact" id="sendSupportReply" type="submit">إرسال الرد</button></div></form></section>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(()=>{const list=document.getElementById('supportMessageList');if(list)list.scrollTop=list.scrollHeight;});
  const close=()=>overlay.remove();document.getElementById('closeSupportModal').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.getElementById('supportReplyForm').addEventListener('submit',async e=>{e.preventDefault();const btn=document.getElementById('sendSupportReply');const msg=document.getElementById('supportReplyMessage');const input=document.getElementById('supportReplyText');const text=input.value.trim();if(!text)return;btn.disabled=true;btn.textContent='جارٍ الإرسال...';msg.textContent='';try{await sendAdminSupportReply(source,conversation,text);messages=await loadSupportConversationMessages(source,conversation);document.getElementById('supportMessageList').innerHTML=renderSupportMessageRows(messages,source,conversation);const list=document.getElementById('supportMessageList');if(list)list.scrollTop=list.scrollHeight;input.value='';msg.textContent='تم إرسال الرد وحفظه بنجاح.';await loadSystemData();}catch(err){msg.textContent='تعذر إرسال الرد: '+err.message;}finally{btn.disabled=false;btn.textContent='إرسال الرد';}});
}

function pinResetRoleLabel(role){return role==='driver'?'سائق':role==='business'?'متجر':'عميل';}
function pinResetStatusLabel(status){return ({pending:'بانتظار الإدارة',issued:'تم إصدار رمز',completed:'مكتمل',rejected:'مرفوض',expired:'منتهي',cancelled:'ملغي'})[String(status||'').toLowerCase()]||String(status||'—');}
function normalizePhoneForCall(phone){
  const raw=String(phone||'').trim();
  if(!raw) return '';
  return raw.replace(/[^\d+]/g,'');
}
function normalizePhoneForWhatsApp(phone){
  let digits=String(phone||'').replace(/\D/g,'');
  if(!digits) return '';
  if(digits.startsWith('00964')) digits=digits.slice(2);
  else if(digits.startsWith('00')) digits=digits.slice(2);
  if(digits.startsWith('964')) return digits;
  if(digits.startsWith('0')) return `964${digits.slice(1)}`;
  return digits;
}
function pinWhatsAppMessage(role,code){
  return `رمز استرجاع PIN الخاص بحساب هلا طلب هو: ${code}\nصلاحية الرمز 30 دقيقة.\nيرجى عدم مشاركة الرمز مع أي شخص.`;
}
function openPhoneCall(phone){
  const value=normalizePhoneForCall(phone);
  if(!value){alert('رقم الهاتف غير متوفر.');return;}
  window.location.href=`tel:${value}`;
}
function openPinWhatsApp(phone,role,code){
  const value=normalizePhoneForWhatsApp(phone);
  if(!value){alert('رقم الهاتف غير متوفر لفتح واتساب.');return;}
  const text=encodeURIComponent(pinWhatsAppMessage(role,code));
  window.open(`https://wa.me/${value}?text=${text}`,'_blank','noopener,noreferrer');
}
async function issuePinRecoveryCode(requestId){
  const request=(systemPageState.pinResets||[]).find(r=>String(r.id)===String(requestId))||{};
  const phone=String(request.phone_e164||request.phone||request.phone_number||request.mobile||'').trim();
  const role=String(request.account_role||'customer');
  const {data,error}=await supabase.rpc('admin_issue_phone_pin_reset_code',{p_request_id:requestId});
  if(error) throw new Error(error.message+' — تأكد من تشغيل admin_stage27_pin_recovery.sql.');
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.recovery_code) throw new Error('لم يرجع الخادم رمز الاسترجاع.');
  const code=String(row.recovery_code);
  const overlay=document.createElement('div');overlay.className='modal-overlay';
  overlay.innerHTML=`<section class="modal-card small-modal pin-code-modal"><div class="modal-head"><div><span class="pill">استرجاع PIN</span><h2>رمز الاسترجاع: <span dir="ltr">${escapeHtml(code)}</span></h2><p class="modal-subtitle">${escapeHtml(pinResetRoleLabel(role))} · <span dir="ltr">${escapeHtml(phone||'رقم غير متوفر')}</span><br>يبقى نفس الرمز لهذا الحساب لمدة 30 دقيقة من وقت إصداره.</p></div><button class="icon-btn" id="pinCodeClose">×</button></div><div class="pin-ready-message"><strong>رسالة واتساب جاهزة:</strong><p>${escapeHtml(pinWhatsAppMessage(role,code)).replace(/\n/g,'<br>')}</p></div><div class="inline-actions pin-contact-actions"><button class="primary-btn" id="pinWhatsAppBtn">💬 واتساب وإرسال الرمز</button><button class="secondary-btn" id="pinCallBtn">📞 اتصال</button><button class="secondary-btn" id="pinCodeCopy">نسخ الرمز</button></div></section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.querySelector('#pinCodeClose').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  overlay.querySelector('#pinCodeCopy').onclick=async()=>{try{await navigator.clipboard.writeText(code);overlay.querySelector('#pinCodeCopy').textContent='تم النسخ ✓';}catch(_){alert('الرمز: '+code);}};
  overlay.querySelector('#pinCallBtn').onclick=()=>openPhoneCall(phone);
  overlay.querySelector('#pinWhatsAppBtn').onclick=()=>openPinWhatsApp(phone,role,code);
}
async function rejectPinRecovery(requestId){
  if(!confirm('رفض طلب استرجاع PIN؟')) return;
  const {error}=await supabase.rpc('admin_reject_phone_pin_reset',{p_request_id:requestId});
  if(error){alert('تعذر رفض الطلب: '+error.message);return;}
  await loadSystemData();renderSystemTab();
}
function pinResetRowsFor(scope='customer'){
  let rows=[...(systemPageState.pinResets||[])].sort((a,b)=>new Date(b.requested_at||0)-new Date(a.requested_at||0));
  if(scope==='customer') return rows.filter(r=>String(r.account_role||'')==='customer');
  rows=rows.filter(r=>['business','driver'].includes(String(r.account_role||'')));
  const f=systemPageState.pinPartnerFilter||'all';
  return f==='all'?rows:rows.filter(r=>String(r.account_role||'')===f);
}
function renderPinResetRequests(scope='customer'){
  if(!systemPageState.pinResetTable) return '<div class="inline-alert warning">طلبات استرجاع PIN غير مفعلة بعد. شغّل admin_stage27_pin_recovery.sql.</div>';
  const rows=pinResetRowsFor(scope);
  const open=rows.filter(r=>['pending','issued'].includes(String(r.status||'').toLowerCase()));
  const isPartners=scope==='partners';
  const partnerFilters=isPartners?`<div class="pin-recovery-filters"><button class="system-tab ${systemPageState.pinPartnerFilter==='all'?'active':''}" data-pin-partner-filter="all">الكل</button><button class="system-tab ${systemPageState.pinPartnerFilter==='business'?'active':''}" data-pin-partner-filter="business">المتاجر</button><button class="system-tab ${systemPageState.pinPartnerFilter==='driver'?'active':''}" data-pin-partner-filter="driver">السائقون</button></div>`:'';
  const title=isPartners?'استرجاع PIN المتاجر والسائقين':'استرجاع PIN العملاء';
  const note=isPartners?'طلبات استرجاع PIN الخاصة بالشركاء. تحقق من صاحب الحساب قبل إصدار الرمز.':'طلبات استرجاع PIN الخاصة بالعملاء فقط. تحقق من صاحب الرقم قبل إصدار الرمز.';
  return `<section class="pin-recovery-hero"><div><span class="pill">استرجاع الحساب</span><h3>${title}</h3><p>${note} الرمز من 6 أرقام، ويبقى نفسه للحساب لمدة 30 دقيقة من وقت إصداره.</p></div><div class="pin-recovery-kpi"><strong>${fmtNumber(open.length)}</strong><span>طلب مفتوح</span></div></section>${partnerFilters}<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>النوع</th><th>رقم الهاتف</th><th>الحالة</th><th>وقت الطلب</th><th>انتهاء الرمز</th><th>الإجراء</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr data-pin-row="${escapeHtml(String(r.id))}"><td data-label="النوع"><span class="tag">${escapeHtml(pinResetRoleLabel(r.account_role))}</span></td><td data-label="رقم الهاتف" dir="ltr"><strong>${escapeHtml(r.phone_e164||'—')}</strong></td><td data-label="الحالة"><span class="status-chip">${escapeHtml(pinResetStatusLabel(r.status))}</span></td><td data-label="وقت الطلب">${fmtDate(r.requested_at||r.updated_at)}</td><td data-label="انتهاء الرمز">${r.code_expires_at?fmtDate(r.code_expires_at):'—'}</td><td data-label="الإجراء">${['pending','issued'].includes(String(r.status||'').toLowerCase())?`<div class="inline-actions"><button class="primary-btn tiny" data-pin-issue="${escapeHtml(String(r.id))}">${r.status==='issued'?'عرض نفس الرمز':'إصدار رمز'}</button><button class="secondary-btn tiny" data-pin-reject="${escapeHtml(String(r.id))}">رفض</button></div>`:'—'}</td></tr>`).join(''):`<tr><td colspan="6" class="muted-cell">لا توجد طلبات استرجاع PIN في هذه الصفحة.</td></tr>`}</tbody></table></div></section>`;
}
function focusPendingPinReset(){
  if(pendingAdminNavigationTarget?.type!=='pin_reset' || !pendingAdminNavigationTarget.id) return;
  const id=String(pendingAdminNavigationTarget.id);
  const row=document.querySelector(`[data-pin-row="${CSS.escape(id)}"]`);
  if(!row) return;
  pendingAdminNavigationTarget=null;
  row.classList.add('pin-reset-focus');
  row.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>row.classList.remove('pin-reset-focus'),3500);
}
function wirePinRecovery(scope='customer'){
  document.querySelectorAll('[data-pin-issue]').forEach(b=>b.addEventListener('click',async()=>{try{await issuePinRecoveryCode(b.dataset.pinIssue);await loadSystemData();renderSystemTab();}catch(e){alert('تعذر إصدار الرمز: '+e.message);}}));
  document.querySelectorAll('[data-pin-reject]').forEach(b=>b.addEventListener('click',()=>rejectPinRecovery(b.dataset.pinReject)));
  document.querySelectorAll('[data-pin-partner-filter]').forEach(b=>b.addEventListener('click',()=>{systemPageState.pinPartnerFilter=b.dataset.pinPartnerFilter||'all';renderSystemTab();}));
  setTimeout(focusPendingPinReset,60);
}

function renderSystemSupport() {
  const storeWarning = systemPageState.stores.length ? '' : `<div class="inline-alert warning">لم يتم تحميل أي متجر. اضغط تحديث البيانات بعد التأكد من تشغيل SQL الخاص بهذه النسخة.</div>`;
  if (!systemPageState.supportTable && !systemPageState.partnerSupportTable) return `<section class="empty-state compact-empty"><h3>جداول الدعم غير متاحة</h3></section>`;
  const customerRows=(systemPageState.support||[]).map(r=>({...r,__source:'customer',__actor:'العميل'}));
  const partnerRows=(systemPageState.partnerSupport||[]).map(r=>({...r,__source:'partner',__actor:supportActorLabel(pick(r,['partner_type','role','sender_role','type'],'partner'),'متجر / سائق')}));
  const rows=[...customerRows,...partnerRows].sort((a,b)=>new Date(pick(b,['updated_at','created_at'],0))-new Date(pick(a,['updated_at','created_at'],0)));
  return `${storeWarning}<div class="system-section-head"><div><h3>الدعم والشكاوى</h3><p>رسائل العميل والمتجر والسائق في مكان واحد، مع إمكانية الرد من لوحة الإدارة.</p></div><span class="tag">${fmtNumber(rows.length)} محادثة</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>المصدر</th><th>الموضوع</th><th>الحساب</th><th>الحالة</th><th>آخر تحديث</th><th>الإجراء</th></tr></thead><tbody>${rows.length ? rows.map((r)=>`<tr><td><span class="tag">${escapeHtml(r.__actor)}</span></td><td>${escapeHtml(pick(r,['subject_ar','subject','title'],'بدون موضوع'))}</td><td>${escapeHtml(systemShort(pick(r,['customer_id','user_id','partner_id','owner_id','driver_id'],'—')))}</td><td>${escapeHtml(pick(r,['status','state'],'مفتوح'))}</td><td>${fmtDate(pick(r,['updated_at','created_at'],null))}</td><td><button class="secondary-btn tiny" data-support-source="${r.__source}" data-support-open="${escapeHtml(String(r.id||''))}">فتح والرد</button></td></tr>`).join('') : `<tr><td colspan="6" class="muted-cell">لا توجد محادثات دعم حاليًا.</td></tr>`}</tbody></table></div>`;
}
function wireSystemSupport(){document.querySelectorAll('[data-support-open]').forEach(b=>b.addEventListener('click',()=>openSupportConversation(b.dataset.supportOpen,b.dataset.supportSource||'')));}
function renderSystemSettings() {
  const storeWarning = systemPageState.stores.length ? '' : `<div class="inline-alert warning">لم يتم تحميل أي متجر. اضغط تحديث البيانات ثم أعد المحاولة.</div>`;
  const currencyRaw=String(systemSetting('currency','IQD')).toUpperCase();
  const currencyLabel=currencyRaw==='IQD'?'الدينار العراقي (IQD)':currencyRaw;
  const maintenanceRaw=String(systemSetting('maintenance_mode','false')).toLowerCase();
  const maintenanceOn=['true','1','yes','on'].includes(maintenanceRaw);
  const driverLimit=systemSetting('driver_active_order_limit','10');
  const driverApprovalRaw=String(systemSetting('driver_approval_required','false')).toLowerCase();
  const driverApprovalRequired=['true','1','yes','on'].includes(driverApprovalRaw);
  const mStart=String(systemSetting('maintenance_starts_at',''));
  const mEnd=String(systemSetting('maintenance_ends_at',''));
  const maintenanceHours=Number(systemSetting('maintenance_duration_hours','2'))||2;
  const mMessage=String(systemSetting('maintenance_message','هلا طلب تحت الصيانة مؤقتًا، نعود قريبًا.'));
  const targets=String(systemSetting('maintenance_targets','customer,store,driver')).split(',').filter(Boolean);
  const endLabel=mEnd?fmtDate(mEnd):'يُحسب تلقائيًا عند التفعيل';
  return `${storeWarning}<div class="system-section-head"><div><h3>إعدادات النظام</h3><p>عرض مبسّط للإعدادات الأساسية التي تؤثر على تشغيل المنصة.</p></div></div>
  <div class="settings-friendly-grid">
    <article class="setting-friendly-card"><span>اسم المنصة</span><strong>${escapeHtml(systemSetting('platform_name','هلا طلب'))}</strong><small>الاسم الظاهر في لوحة الإدارة</small></article>
    <article class="setting-friendly-card"><span>العملة</span><strong>${escapeHtml(currencyLabel)}</strong><small>العملة المستخدمة في الأسعار والتقارير</small><button type="button" class="secondary-btn compact" data-setting-edit="currency">تعديل</button></article>
    <article class="setting-friendly-card"><span>طلبات السائق النشطة</span><strong>${escapeHtml(String(driverLimit))} كحد أقصى</strong><small>الحد المسموح للسائق في الوقت نفسه</small><button type="button" class="secondary-btn compact" data-setting-edit="driver_active_order_limit">تعديل</button></article>
    <article class="setting-friendly-card"><span>تسجيل السائقين</span><strong class="${driverApprovalRequired?'setting-danger':'setting-ok'}">${driverApprovalRequired?'موافقة الإدارة مطلوبة':'مفتوح مباشرة'}</strong><small>${driverApprovalRequired?'السائق الجديد ينتظر موافقة الإدارة قبل الدخول':'أي سائق جديد يدخل مباشرة بعد التسجيل'}</small><button type="button" class="${driverApprovalRequired?'secondary-btn':'primary-btn'} compact" data-driver-approval-toggle="${driverApprovalRequired?'false':'true'}">${driverApprovalRequired?'فتح التسجيل المباشر':'تفعيل موافقة الإدارة'}</button></article>
    <article class="setting-friendly-card"><span>وضع الصيانة</span><strong class="${maintenanceOn?'setting-danger':'setting-ok'}">${maintenanceOn?'مفعّل':'متوقف'}</strong><small>${maintenanceOn?'المنصة في وضع صيانة':'التشغيل طبيعي'}</small><button type="button" class="${maintenanceOn?'secondary-btn':'primary-btn'} compact" data-maintenance-toggle="${maintenanceOn?'false':'true'}">${maintenanceOn?'إيقاف وضع الصيانة':'تفعيل وضع الصيانة'}</button></article>
  </div>
  <article class="panel maintenance-schedule-panel">
    <div class="panel-head"><div><span>صيانة مؤقتة</span><h3>جدولة رسالة الصيانة</h3></div><span class="tag">${maintenanceOn?'مفعّلة الآن':'جاهزة عند التفعيل'}</span></div>
    <p class="panel-note">اختر مدة الصيانة بالساعات. عند التفعيل يبدأ الوقت من لحظة التفعيل ويحسب وقت العودة تلقائيًا. لوحة الإدارة تبقى متاحة للمدير.</p>
    <div class="maintenance-grid">
      <label>مدة الصيانة<select id="maintenanceDurationHours"><option value="1" ${maintenanceHours===1?'selected':''}>1 ساعة</option><option value="2" ${maintenanceHours===2?'selected':''}>ساعتان</option><option value="3" ${maintenanceHours===3?'selected':''}>3 ساعات</option><option value="6" ${maintenanceHours===6?'selected':''}>6 ساعات</option><option value="12" ${maintenanceHours===12?'selected':''}>12 ساعة</option><option value="custom" ${![1,2,3,6,12].includes(maintenanceHours)?'selected':''}>مدة مخصصة</option></select></label>
      <label id="maintenanceCustomHoursWrap" style="${![1,2,3,6,12].includes(maintenanceHours)?'':'display:none'}">عدد الساعات<input id="maintenanceCustomHours" type="number" min="0.5" max="72" step="0.5" value="${escapeHtml(String(maintenanceHours))}"></label>
      <label>العودة المتوقعة<input type="text" value="${escapeHtml(endLabel)}" disabled></label>
      <label class="maintenance-message-field">رسالة الصيانة<textarea id="maintenanceMessage" rows="3" placeholder="هلا طلب تحت الصيانة مؤقتًا...">${escapeHtml(mMessage)}</textarea></label>
    </div>
    <div class="maintenance-targets">
      <strong>تظهر الرسالة إلى:</strong>
      <label><input id="maintenanceTargetCustomer" type="checkbox" ${targets.includes('customer')?'checked':''}> العملاء</label>
      <label><input id="maintenanceTargetStore" type="checkbox" ${targets.includes('store')?'checked':''}> أصحاب المتاجر</label>
      <label><input id="maintenanceTargetDriver" type="checkbox" ${targets.includes('driver')?'checked':''}> السائقون</label>
    </div>
    <div class="inline-actions"><button type="button" class="primary-btn compact" id="saveMaintenanceSchedule">حفظ إعدادات الصيانة</button>${maintenanceOn?'<button type="button" class="secondary-btn compact" id="extendMaintenanceHour">تمديد ساعة</button><button type="button" class="danger-btn compact" id="endMaintenanceNow">إنهاء الصيانة الآن</button>':''}</div>
    <div id="maintenanceScheduleMessage"></div>
  </article>
  <div id="systemSettingsMessage"></div><p class="panel-note">أي تغيير يحتاج تأكيدًا ويُحفظ مباشرة في إعدادات المنصة.</p>`;
}

async function updateSystemSettingValue(key,value){let row=systemPageState.settings.find(x=>x.setting_key===key);const box=document.getElementById('systemSettingsMessage');const {data:{user}}=await supabase.auth.getUser();const payload={setting_key:key,setting_value:String(value),updated_by:user?.id||null,updated_at:new Date().toISOString()};const {data,error}=await supabase.from('admin_system_settings').upsert(payload,{onConflict:'setting_key'}).select().maybeSingle();if(error){if(box)box.innerHTML=`<div class="alert error">تعذر حفظ الإعداد: ${escapeHtml(error.message)}</div>`;return false;}if(row)row.setting_value=String(value);else{row=data||payload;systemPageState.settings.push(row);}await systemAudit('update_system_setting','system_setting',key,{value:String(value)});if(box)box.innerHTML='<div class="alert success">تم حفظ الإعداد بنجاح.</div>';return true;}
function wireSystemSettingsActions(){
  document.querySelector('[data-driver-approval-toggle]')?.addEventListener('click',async e=>{
    const value=e.currentTarget.dataset.driverApprovalToggle;
    const enabling=value==='true';
    const message=enabling
      ? 'بعد التفعيل، أي سائق جديد سيبقى قيد المراجعة حتى توافق الإدارة. السائقون المقبولون سابقًا يستمرون طبيعيًا. هل تريد المتابعة؟'
      : 'فتح تسجيل السائقين مباشرة؟ السائق الجديد سيدخل فور إكمال التسجيل بدون انتظار موافقة الإدارة.';
    if(!confirm(message))return;
    if(await updateSystemSettingValue('driver_approval_required',value)){
      await systemAudit(enabling?'enable_driver_approval':'disable_driver_approval','system_setting','driver_approval_required',{value});
      renderSystemTab();
    }
  });
  document.querySelector('[data-maintenance-toggle]')?.addEventListener('click',async e=>{
    const v=e.currentTarget.dataset.maintenanceToggle;
    if(!confirm(v==='true'?'تفعيل وضع الصيانة سيوقف الاستخدام الطبيعي للتطبيقات المحددة. هل أنت متأكد؟':'إيقاف وضع الصيانة وإعادة التشغيل الطبيعي؟'))return;
    if(v==='true'){
      const hours=Number(systemSetting('maintenance_duration_hours','2'))||2;
      const start=new Date();const end=new Date(start.getTime()+hours*3600000);
      await updateSystemSettingValue('maintenance_starts_at',start.toISOString());
      await updateSystemSettingValue('maintenance_ends_at',end.toISOString());
    }
    if(await updateSystemSettingValue('maintenance_mode',v))renderSystemTab();
  });
  document.querySelectorAll('[data-setting-edit]').forEach(b=>b.addEventListener('click',async()=>{
    const key=b.dataset.settingEdit;const current=systemSetting(key,key==='currency'?'IQD':'10');
    const label=key==='currency'?'رمز العملة (مثال IQD)':'الحد الأقصى لطلبات السائق النشطة';
    const value=prompt(label,current);if(value==null)return;
    if(key==='driver_active_order_limit'&&(!/^\d+$/.test(value)||Number(value)<1)){alert('أدخل رقمًا صحيحًا أكبر من صفر.');return;}
    if(key==='currency'&&!/^[A-Za-z]{3}$/.test(value.trim())){alert('أدخل رمز عملة من 3 أحرف مثل IQD.');return;}
    if(!confirm(`حفظ القيمة الجديدة: ${value} ؟`))return;
    if(await updateSystemSettingValue(key,key==='currency'?value.trim().toUpperCase():value.trim()))renderSystemTab();
  }));
  document.getElementById('maintenanceDurationHours')?.addEventListener('change',e=>{document.getElementById('maintenanceCustomHoursWrap').style.display=e.target.value==='custom'?'':'none';});
  document.getElementById('saveMaintenanceSchedule')?.addEventListener('click',async()=>{
    const preset=document.getElementById('maintenanceDurationHours')?.value||'2';
    const hours=preset==='custom'?Number(document.getElementById('maintenanceCustomHours')?.value||0):Number(preset);
    const message=document.getElementById('maintenanceMessage')?.value?.trim()||'هلا طلب تحت الصيانة مؤقتًا، نعود قريبًا.';
    const targets=[
      document.getElementById('maintenanceTargetCustomer')?.checked?'customer':null,
      document.getElementById('maintenanceTargetStore')?.checked?'store':null,
      document.getElementById('maintenanceTargetDriver')?.checked?'driver':null
    ].filter(Boolean);
    const box=document.getElementById('maintenanceScheduleMessage');
    if(!Number.isFinite(hours)||hours<0.5||hours>72){if(box)box.innerHTML='<div class="alert error">اختر مدة صحيحة بين نصف ساعة و72 ساعة.</div>';return;}
    if(!targets.length){if(box)box.innerHTML='<div class="alert error">اختر تطبيقًا واحدًا على الأقل لعرض رسالة الصيانة.</div>';return;}
    if(!confirm('حفظ إعدادات الصيانة المؤقتة؟'))return;
    if(box)box.innerHTML='<div class="alert">جارٍ الحفظ...</div>';
    const pairs=[['maintenance_duration_hours',String(hours)],['maintenance_message',message],['maintenance_targets',targets.join(',')]];
    for(const [k,v] of pairs){if(!await updateSystemSettingValue(k,v)){if(box)box.innerHTML='<div class="alert error">تعذر حفظ جميع إعدادات الصيانة.</div>';return;}}
    await systemAudit('schedule_maintenance','system_setting','maintenance_mode',{hours,message,targets});
    if(box)box.innerHTML='<div class="alert success">تم حفظ مدة ورسالة الصيانة. عند التفعيل سيُحسب وقت العودة تلقائيًا.</div>';
  });
  document.getElementById('extendMaintenanceHour')?.addEventListener('click',async()=>{
    const current=String(systemSetting('maintenance_ends_at',''));const base=current?new Date(current):new Date();
    const next=new Date(Math.max(Date.now(),base.getTime())+3600000);
    if(await updateSystemSettingValue('maintenance_ends_at',next.toISOString())){await systemAudit('extend_maintenance','system_setting','maintenance_mode',{hours:1});renderSystemTab();}
  });
  document.getElementById('endMaintenanceNow')?.addEventListener('click',async()=>{
    if(!confirm('إنهاء وضع الصيانة الآن وإعادة التشغيل الطبيعي؟'))return;
    await updateSystemSettingValue('maintenance_ends_at',new Date().toISOString());
    if(await updateSystemSettingValue('maintenance_mode','false')){await systemAudit('end_maintenance','system_setting','maintenance_mode',{});renderSystemTab();}
  });
}


function auditActionLabel(v){const s=String(v||'');return ({
  reactivate_driver:'إعادة تفعيل السائق',suspend_driver:'إيقاف السائق مؤقتًا',block_driver:'إيقاف السائق نهائيًا',
  pause_store:'إيقاف المتجر مؤقتًا',reactivate_store:'إعادة تفعيل المتجر',archive_store:'أرشفة / إغلاق المتجر',hard_delete_store:'حذف المتجر نهائيًا',
  open_store:'فتح المتجر إداريًا',close_store:'إغلاق المتجر إداريًا',
  update_system_setting:'تعديل إعدادات النظام',schedule_maintenance:'حفظ إعدادات الصيانة',extend_maintenance:'تمديد الصيانة ساعة',end_maintenance:'إنهاء الصيانة',
  activate_offer:'تفعيل عرض أو كوبون',pause_offer:'إيقاف عرض أو كوبون',edit_offer:'تعديل عرض أو كوبون',delete_offer:'حذف عرض أو كوبون',
  suspend_user:'إيقاف المستخدم مؤقتًا',reactivate_user:'إعادة تفعيل المستخدم',issue_pin_reset:'إصدار رمز استرجاع PIN',reject_pin_reset:'رفض استرجاع PIN'
})[s]||s.replaceAll('_',' ')||'عملية';}
function auditEntityLabel(v){const s=String(v||'');return ({store:'متجر',driver:'سائق',user:'مستخدم',system_setting:'إعدادات النظام',coupon:'كوبون',promotion:'عرض متجر',order:'طلب'})[s]||s||'—';}
function renderSystemAudit() {
  const storeWarning = systemPageState.stores.length ? '' : `<div class="inline-alert warning">لم يتم تحميل أي متجر. اضغط تحديث البيانات بعد التأكد من تشغيل SQL الخاص بهذه النسخة.</div>`;
  const rows=[...systemPageState.audit].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,100);
  return `${storeWarning}<div class="system-section-head"><div><h3>سجل العمليات</h3><p>آخر العمليات الإدارية بتسميات عربية واضحة.</p></div><span class="tag">${fmtNumber(rows.length)} عملية</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>العملية</th><th>النوع</th><th>المعرف</th><th>الوقت</th></tr></thead><tbody>${rows.length ? rows.map((r)=>`<tr><td><strong>${escapeHtml(auditActionLabel(r.action))}</strong></td><td>${escapeHtml(auditEntityLabel(r.entity_type))}</td><td>${escapeHtml(systemShort(r.entity_id))}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('') : `<tr><td colspan="4" class="muted-cell">لا توجد عمليات مسجلة بعد.</td></tr>`}</tbody></table></div>`;
}
function renderSystemTab() {
  const host=document.getElementById('systemTabContent'); if (!host) return;
  const tab=systemPageState.tab;
  if (tab==='client-categories') { host.innerHTML=renderClientCategories(); wireClientCategories(); }
  else if (tab==='categories') { host.innerHTML=renderSystemCategories(); wireSystemCategories(); }
  else if (tab==='offers') { host.innerHTML=renderSystemOffers(); wireSystemOffers(); }
  else if (tab==='finance') { host.innerHTML=renderSystemFinance(); wireSystemFinance(); }
  else if (tab==='pin-customers') { host.innerHTML=renderPinResetRequests('customer'); wirePinRecovery('customer'); }
  else if (tab==='pin-partners') { host.innerHTML=renderPinResetRequests('partners'); wirePinRecovery('partners'); }
  else if (tab==='support') { host.innerHTML=renderSystemSupport(); wireSystemSupport(); }
  else if (tab==='settings') { host.innerHTML=renderSystemSettings(); wireSystemSettingsActions(); }
  else if (tab==='audit') host.innerHTML=renderSystemAudit();
  else { host.innerHTML=renderSystemOverview(); wireSystemOverview(); }
}
function wireSystemTabs() {
  document.querySelectorAll('[data-system-tab]').forEach((button)=>button.addEventListener('click',()=>{
    systemPageState.tab=button.dataset.systemTab;
    document.querySelectorAll('[data-system-tab]').forEach((x)=>x.classList.toggle('active',x===button));
    renderSystemTab();
  }));
}
async function renderSystemPage() {
  const content=document.getElementById('content');
  content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ تحميل إدارة النظام...</h2><p>تجهيز أدوات إدارة المنصة...</p></section>`;
  try {
    await loadSystemData();
    await startSystemSupportRealtime();
    content.innerHTML=`<section class="dashboard-hero"><div><span class="pill">لوحة الإدارة</span><h2>إدارة النظام</h2><p>إدارة واضحة للأقسام والعروض والدعم والإعدادات، مع إبقاء الأدوات المتقدمة عند الحاجة.</p></div><button id="refreshSystem" class="secondary-btn">↻ تحديث البيانات</button></section><section class="system-tabs">${SYSTEM_TABS.map(([id,label])=>`<button class="system-tab ${systemPageState.tab===id?'active':''}" data-system-tab="${id}">${label}</button>`).join('')}</section><section class="panel system-tab-panel" id="systemTabContent"></section>`;
    wireSystemTabs();
    document.getElementById('refreshSystem')?.addEventListener('click',renderSystemPage);
    renderSystemTab();
  } catch (e) {
    content.innerHTML=`<section class="empty-state"><div class="empty-icon">⚙</div><span class="pill">إدارة هلا طلب</span><h2>تعذر تحميل إدارة النظام</h2><p>${escapeHtml(e && e.message ? e.message : String(e))}</p></section>`;
  }
}

function renderPlaceholder(pageId,label) { document.getElementById('content').innerHTML = `<section class="empty-state"><div class="empty-icon">${icons[pageId]||'•'}</div><span class="pill">قيد المراحل القادمة</span><h2>${escapeHtml(label)}</h2><p>هذه الصفحة مثبتة في التنقل وسيتم تنفيذها في المرحلة الخاصة بها.</p></section>`; }


// ===== إدارة هلا طلب: Security, admin permissions, and RLS review =====
const SECURITY_PERMISSION_LABELS = {
  can_dashboard:'لوحة المتابعة', can_orders:'الطلبات', can_stores:'المتاجر', can_drivers:'السائقون',
  can_users:'المستخدمون', can_reports:'التقارير', can_system:'إدارة النظام', can_security:'الأمان والصلاحيات'
};
let securityState = { admins:[], policies:[], summary:null, currentUserId:null };

function boolBadge(v, yes='مفعّل', no='غير مفعّل') {
  return `<span class="review-pill ${v?'review-approved':'review-rejected'}">${v?yes:no}</span>`;
}
function securityPermissionSummary(a){
  const keys=Object.keys(SECURITY_PERMISSION_LABELS);
  const enabled=keys.filter(k=>a[k]!==false);
  return `${enabled.length}/${keys.length}`;
}
async function loadSecurityData(){
  const session=(await supabase.auth.getSession()).data.session;
  securityState.currentUserId=session?.user?.id||null;
  const [admins,policies,summary] = await Promise.all([
    supabase.rpc('admin_security_list_admins'),
    supabase.rpc('admin_security_policy_report'),
    supabase.rpc('admin_security_summary')
  ]);
  if(admins.error) throw admins.error;
  if(policies.error) throw policies.error;
  if(summary.error) throw summary.error;
  securityState.admins=admins.data||[]; securityState.policies=policies.data||[]; securityState.summary=summary.data||{};
}
function renderSecurityOverview(){
  const s=securityState.summary||{};
  const disabled=securityState.policies.filter(x=>!x.rls_enabled);
  const unsafeKey = String(APP_CONFIG.supabaseAnonKey||'').toLowerCase().includes('service_role');
  const healthy=!unsafeKey && disabled.length===0;
  return `<section class="security-health-hero ${healthy?'healthy':'warning'}"><div class="security-health-icon">${healthy?'✅':'⚠️'}</div><div><span>حالة حماية لوحة الإدارة</span><h3>${healthy?'الحماية سليمة':'توجد نقاط تحتاج مراجعة'}</h3><p>${healthy?'فحوص الوصول والحماية الأساسية ناجحة، ولا يحتاج المدير اليومي إلى أي إجراء.':'راجع التفاصيل التقنية المتقدمة لمعرفة العناصر التي تحتاج معالجة.'}</p></div></section>
  <section class="system-overview-grid">
    <article class="system-source-card"><div class="system-source-icon">👤</div><div><span>المدراء النشطون</span><strong>${fmtNumber(s.active_admins||0)}</strong><small>حسابات إدارة مفعّلة</small></div></article>
    <article class="system-source-card"><div class="system-source-icon">🛡️</div><div><span>عناصر الحماية المفحوصة</span><strong>${fmtNumber(s.rls_enabled_tables||0)}</strong><small>تعمل بالحماية المطلوبة</small></div></article>
    <article class="system-source-card"><div class="system-source-icon">⚠️</div><div><span>تحتاج تدخل</span><strong>${fmtNumber(disabled.length + (unsafeKey?1:0))}</strong><small>${healthy?'لا توجد ملاحظات حرجة':'راجع التفاصيل المتقدمة'}</small></div></article>
  </section>
  <section class="panel system-intro"><div class="panel-head"><div><span>فحص اتصال الإدارة</span><h3>الوصول الإداري</h3></div>${boolBadge(healthy,'سليم','مراجعة')}</div>
  <div class="health-list"><div><span>مفتاح سري داخل واجهة الويب</span><b>${unsafeKey?'موجود — يحتاج إزالة':'غير موجود'}</b></div><div><span>التحقق من صلاحية المدير</span><b>مفعّل</b></div><div><span>حماية صلاحية المدير الحالي</span><b>مفعّلة</b></div></div>
  <p class="panel-note">للمعلومات البرمجية التفصيلية افتح تبويب «تفاصيل تقنية متقدمة» فقط عند الحاجة.</p></section>`;
}
function renderSecurityAdmins(){
  const rows=securityState.admins;
  return `<div class="system-section-head"><div><h3>صلاحيات المدراء</h3><p>تحديد الوحدات التي تظهر لكل مدير داخل لوحة الإدارة، مع حماية صلاحية الأمان للمدير الحالي.</p></div></div>
  <div class="table-wrap"><table class="data-table security-table"><thead><tr><th>المدير</th><th>البريد</th><th>الحالة</th><th>الصلاحيات</th><th>آخر تحديث</th><th></th></tr></thead><tbody>${rows.length?rows.map(a=>`<tr><td>${escapeHtml(a.display_name||'مدير')}</td><td>${escapeHtml(a.email||'—')}</td><td>${boolBadge(a.admin_active!==false,'نشط','متوقف')}</td><td>${securityPermissionSummary(a)} وحدات</td><td>${fmtDate(a.permissions_updated_at)}</td><td><button class="secondary-btn compact security-edit" data-id="${a.user_id}">إدارة الصلاحيات</button></td></tr>`).join(''):`<tr><td colspan="6" class="muted-cell">لا يوجد مدراء.</td></tr>`}</tbody></table></div>`;
}
function renderSecurityPolicies(){
  const rows=securityState.policies;
  return `<div class="advanced-tech-head"><div><span class="pill">للمسؤول التقني</span><h3>تفاصيل تقنية متقدمة</h3><p>هذه الصفحة مخصصة للفحص التقني لحماية قاعدة البيانات وسياسات الوصول. لا تحتاج تعديلها أثناء الإدارة اليومية.</p></div></div>
  <div class="table-wrap"><table class="data-table security-table"><thead><tr><th>الجدول التقني</th><th>حماية الصفوف</th><th>السياسات</th><th>سياسات الإدارة</th><th>الملاحظة</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td><b>${escapeHtml(r.table_name)}</b></td><td>${boolBadge(r.rls_enabled,'مفعّلة','غير مفعّلة')}</td><td>${fmtNumber(r.policy_count)}</td><td>${fmtNumber(r.admin_policy_count)}</td><td>${escapeHtml(r.note||'—')}</td></tr>`).join(''):`<tr><td colspan="5" class="muted-cell">لا توجد نتائج.</td></tr>`}</tbody></table></div>`;
}
function openSecurityAdminModal(id){
  const a=securityState.admins.find(x=>x.user_id===id); if(!a)return;
  const own=id===securityState.currentUserId;
  const keys=Object.keys(SECURITY_PERMISSION_LABELS);
  const overlay=document.createElement('div'); overlay.className='modal-overlay';
  overlay.innerHTML=`<div class="modal-card small-modal"><div class="modal-head"><div><span class="pill">إدارة هلا طلب</span><h2>صلاحيات ${escapeHtml(a.display_name||a.email||'المدير')}</h2><p class="modal-subtitle">هذه الصلاحيات تنظّم الوصول إلى وحدات لوحة الإدارة. عضوية Admin نفسها تُدار من صفحة المستخدمين.</p></div><button class="icon-btn" id="securityClose">×</button></div>
  <form id="securityPermForm" class="security-permission-grid">${keys.map(k=>`<label class="security-permission-item"><input type="checkbox" data-perm="${k}" ${(a[k]!==false)?'checked':''} ${(own&&k==='can_security')?'disabled':''}><span><b>${SECURITY_PERMISSION_LABELS[k]}</b><small>${k==='can_security'?'إدارة الأمان وصلاحيات المدراء':'الوصول إلى هذه الوحدة داخل لوحة الإدارة'}</small></span></label>`).join('')}<div class="security-self-note">${own?'حسابك الحالي: لا يمكن إلغاء صلاحية الأمان عن نفسك.':''}</div><button class="primary-btn" type="submit">حفظ الصلاحيات</button><div id="securityPermMsg"></div></form></div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove(); overlay.querySelector('#securityClose').onclick=close; overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  overlay.querySelector('#securityPermForm').addEventListener('submit',async e=>{
    e.preventDefault(); const vals={}; keys.forEach(k=>{const el=overlay.querySelector(`[data-perm="${k}"]`); vals[k]=el?el.checked:(k==='can_security'&&own?true:false);});
    const msg=overlay.querySelector('#securityPermMsg'); msg.textContent='جارٍ الحفظ...';
    const {error}=await supabase.rpc('admin_security_update_permissions',{p_admin_id:id,...Object.fromEntries(keys.map(k=>['p_'+k.replace('can_',''),vals[k]]))});
    if(error){msg.textContent='تعذر الحفظ: '+error.message;return;} msg.textContent='تم حفظ الصلاحيات بنجاح.';
    await loadSecurityData(); setTimeout(()=>{close(); renderSecurityPage('admins');},350);
  });
}
function wireSecurityAdminButtons(){document.querySelectorAll('.security-edit').forEach(b=>b.addEventListener('click',()=>openSecurityAdminModal(b.dataset.id)));}

async function renderSecurityPage(forcedTab='overview'){
  const content=document.getElementById('content'); if(!content)return;
  content.innerHTML=`<section class="loading-panel"><div class="spinner"></div><h2>جارٍ فحص الأمان والصلاحيات...</h2><p>التحقق من حماية لوحة الإدارة وصلاحيات المدراء.</p></section>`;
  try{
    await loadSecurityData();
    content.innerHTML=`<section class="dashboard-hero"><div><span class="pill">لوحة الإدارة</span><h2>الأمان والصلاحيات</h2><p>حالة الحماية وصلاحيات المدراء بشكل مبسّط، مع تفاصيل تقنية منفصلة عند الحاجة.</p></div><button id="refreshSecurity" class="secondary-btn">↻ إعادة الفحص</button></section>
    <section class="system-tabs security-tabs"><button class="system-tab" data-security-tab="overview">حالة الحماية</button><button class="system-tab" data-security-tab="admins">صلاحيات المدراء</button><button class="system-tab" data-security-tab="policies">تفاصيل تقنية متقدمة</button></section><section class="panel system-tab-panel" id="securityHost"></section>`;
    let tab=forcedTab||'overview';
    const paint=()=>{document.querySelectorAll('[data-security-tab]').forEach(x=>x.classList.toggle('active',x.dataset.securityTab===tab)); const h=document.getElementById('securityHost'); h.innerHTML=tab==='admins'?renderSecurityAdmins():tab==='policies'?renderSecurityPolicies():renderSecurityOverview(); if(tab==='admins')wireSecurityAdminButtons();};
    document.querySelectorAll('[data-security-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.securityTab;paint();}));
    document.getElementById('refreshSecurity').onclick=()=>renderSecurityPage(tab); paint();
  }catch(e){content.innerHTML=`<section class="empty-state"><div class="empty-icon">🛡️</div><span class="pill">إدارة هلا طلب</span><h2>تعذر تحميل فحص الأمان</h2><p>${escapeHtml(e?.message||String(e))}</p><p>تأكد من تشغيل ملف admin_stage9_security.sql مرة واحدة في Supabase.</p></section>`;}
}

function wireDashboard() {
  const sidebar=document.getElementById('sidebar'), overlay=document.getElementById('sidebarOverlay'); const close=()=>{sidebar.classList.remove('open');overlay.classList.remove('show');};
  document.getElementById('menuBtn')?.addEventListener('click',()=>{sidebar.classList.toggle('open');overlay.classList.toggle('show');}); overlay.addEventListener('click',close);
  document.querySelectorAll('.nav-item[data-page]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.nav-item[data-page]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const label=btn.textContent.trim();document.getElementById('pageTitle').textContent=label;btn.dataset.page==='dashboard'?renderStageTwoDashboard():btn.dataset.page==='orders'?renderOrdersPage():btn.dataset.page==='stores'?renderStoresPage():btn.dataset.page==='drivers'?renderDriversPage():btn.dataset.page==='users'?renderUsersPage():btn.dataset.page==='reports'?renderReportsPage():btn.dataset.page==='system'?renderSystemPage():btn.dataset.page==='settings'?renderSecurityPage():renderPlaceholder(btn.dataset.page,label);close();}));
  document.getElementById('logoutBtn').addEventListener('click',async()=>{
    try{ await deactivateCurrentPushDevice(); }catch(_){}
    await supabase.auth.signOut();
    renderLogin();
  });
}
async function boot() {
  if (!isSupabaseConfigured()) return renderSetup();
  const { data } = await supabase.auth.getSession(); const user=data.session?.user;
  if (!user) return renderLogin();
  if (!await verifyAdmin(user)) { await supabase.auth.signOut(); return renderLogin('انتهت الجلسة أو لا توجد صلاحية إدارة لهذا الحساب.'); }
  renderDashboard(user);
}
boot();

// Final operational tables and full Arabic order statuses


/* =========================================================
   Admin Stage 30 — full mobile table/card enhancement.
   Pure presentation: labels table cells from their own headers
   and applies a responsive card class. No data/backend changes.
   ========================================================= */
function stage30EnhanceManagementTables(root=document){
  const tables=root.querySelectorAll?.('table.data-table:not([data-stage30-ready])')||[];
  tables.forEach(table=>{
    const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim().replace(/\s+/g,' '));
    if(!headers.length) return;
    table.classList.add('mobile-stack-table');
    table.dataset.stage30Ready='1';
    table.querySelectorAll('tbody tr').forEach(row=>{
      [...row.children].forEach((cell,index)=>{
        if(cell.tagName!=='TD') return;
        if(cell.hasAttribute('colspan')) { cell.dataset.mobileLabel=''; return; }
        const label=headers[index]||'';
        cell.dataset.mobileLabel=label;
      });
    });
  });
}

function stage30StartResponsiveObserver(){
  let raf=0;
  const run=()=>{raf=0;stage30EnhanceManagementTables(document)};
  stage30EnhanceManagementTables(document);
  const observer=new MutationObserver(()=>{
    if(raf) return;
    raf=requestAnimationFrame(run);
  });
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  window.addEventListener('resize',run,{passive:true});
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',stage30StartResponsiveObserver,{once:true});
}else{
  stage30StartResponsiveObserver();
}


/* =========================================================
   Admin Stage 31 — final responsive QA helper.
   Re-applies presentation labels after orientation/pageshow
   without touching data, Supabase, PIN or notification logic.
   ========================================================= */
function stage31FinalResponsiveRefresh(){
  try{ stage30EnhanceManagementTables(document); }catch(_e){}
  document.documentElement.style.setProperty('--stage31-vh', `${window.innerHeight * 0.01}px`);
}
window.addEventListener('orientationchange',()=>setTimeout(stage31FinalResponsiveRefresh,120),{passive:true});
window.addEventListener('pageshow',stage31FinalResponsiveRefresh,{passive:true});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',stage31FinalResponsiveRefresh,{passive:true});
}
stage31FinalResponsiveRefresh();
