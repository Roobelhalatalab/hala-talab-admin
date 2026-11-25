import { supabase, verifyAdmin } from './supabase.js';
const status = document.getElementById('status');
const panel = document.getElementById('panel');
const rows = document.getElementById('rows');
const writeStatus = document.getElementById('writeStatus');
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function td(row, value) { const cell = document.createElement('td'); cell.textContent = value == null ? '—' : String(value); row.appendChild(cell); }
async function refresh() {
  status.textContent = 'جاري جلب المسابقات…'; rows.replaceChildren();
  // Server-side admin authorization is mandatory; no direct table access.
  const { data, error } = await supabase.rpc('ht_prize_admin_list_contests');
  if (error) { status.textContent = 'خدمة المسابقات غير جاهزة أو لا توجد صلاحية: ' + error.message; return; }
  if (!Array.isArray(data)) { status.textContent = 'استجابة غير متوقعة من الخادم'; return; }
  for (const item of data) {
    const row = document.createElement('tr');
    for (const key of ['title','store_name','status','starts_at','ends_at']) td(row,item?.[key]);
    const actions = document.createElement('td');
    const current = String(item?.status ?? '');
    const next = current === 'active' ? 'paused' : current === 'paused' ? 'active' : null;
    if (next && uuidRe.test(String(item?.id ?? ''))) {
      const button = document.createElement('button');
      button.textContent = next === 'paused' ? 'إيقاف مؤقت' : 'إعادة تفعيل';
      button.addEventListener('click', () => changeStatus(item.id, next, button));
      actions.appendChild(button);
    } else { actions.textContent = '—'; }
    if (uuidRe.test(String(item?.id ?? ''))) {
      const reportButton = document.createElement('button');
      reportButton.textContent = 'تقرير';
      reportButton.type = 'button';
      reportButton.style.marginInlineStart = '8px';
      reportButton.addEventListener('click', () => loadReport(item.id, item.title, reportButton));
      actions.appendChild(reportButton);
      const codesButton = document.createElement('button');
      codesButton.textContent = 'الرموز';
      codesButton.type = 'button';
      codesButton.style.marginInlineStart = '8px';
      codesButton.addEventListener('click', () => loadCodes(item.id, item.title, 0));
      actions.appendChild(codesButton);
    }
    row.appendChild(actions);
    rows.appendChild(row);
  }
  status.textContent = data.length ? `عدد المسابقات: ${data.length}` : 'لا توجد مسابقات';
}


async function loadReport(contestId, contestTitle, button) {
  if (!uuidRe.test(String(contestId))) return;
  const reportStatus = document.getElementById('reportStatus');
  const reportRows = document.getElementById('reportRows');
  reportRows.replaceChildren();
  reportStatus.textContent = 'جاري تحميل تقرير: ' + (contestTitle || 'المسابقة');
  button.disabled = true;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await verifyAdmin(user))) throw new Error('صلاحية الإدارة غير متوفرة');
    const { data, error } = await supabase.rpc('ht_prize_admin_contest_report', { p_contest_id: contestId });
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) throw new Error('استجابة التقرير غير متوقعة');
    const item = data[0];
    const tr = document.createElement('tr');
    for (const key of ['codes_count','claims_count','consumed_count','released_count']) td(tr, item[key]);
    reportRows.appendChild(tr);
    reportStatus.textContent = 'تقرير: ' + (contestTitle || 'المسابقة') + ' — الأرقام لا تشمل مبالغ الخصومات.';
  } catch (error) {
    reportStatus.textContent = 'تعذر تحميل التقرير: ' + (error?.message || 'خطأ غير معروف');
  } finally { button.disabled = false; }
}

async function changeStatus(contestId, targetStatus, button) {
  if (!uuidRe.test(String(contestId)) || !['paused','active'].includes(targetStatus)) return;
  const label = targetStatus === 'paused' ? 'إيقاف' : 'إعادة تفعيل';
  if (!window.confirm(`${label} المسابقة؟ قد يؤثر ذلك على إمكانية استخدام الجوائز.`)) return;
  button.disabled = true;
  status.textContent = `جاري ${label} المسابقة…`;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await verifyAdmin(user))) throw new Error('صلاحية الإدارة غير متوفرة');
    const { error } = await supabase.rpc('ht_prize_admin_set_contest_status', {
      p_contest_id: contestId, p_target_status: targetStatus
    });
    if (error) throw error;
    await refresh();
  } catch (error) {
    status.textContent = `تعذر ${label} المسابقة: ` + (error?.message || 'خطأ غير معروف');
  } finally { button.disabled = false; }
}


let codesContestId = null;
let codesContestTitle = '';
let codesOffset = 0;
let codesRequest = 0;
const codesPageSize = 50;
async function loadCodes(contestId, contestTitle, offset) {
  if (!uuidRe.test(String(contestId)) || !Number.isInteger(offset) || offset < 0) return;
  const request = ++codesRequest;
  codesContestId = contestId; codesContestTitle = contestTitle || 'المسابقة'; codesOffset = offset;
  const codeStatus = document.getElementById('codesStatus');
  const codeRows = document.getElementById('codesRows');
  const prev = document.getElementById('codesPrev');
  const next = document.getElementById('codesNext');
  codeRows.replaceChildren(); prev.disabled = true; next.disabled = true;
  codeStatus.textContent = 'جاري تحميل رموز: ' + codesContestTitle;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await verifyAdmin(user))) throw new Error('صلاحية الإدارة غير متوفرة');
    const { data, error } = await supabase.rpc('ht_prize_admin_list_codes', {
      p_contest_id: contestId, p_limit: codesPageSize, p_offset: offset
    });
    if (request !== codesRequest) return;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('استجابة غير متوقعة');
    for (const item of data) {
      const tr = document.createElement('tr');
      // Do not expose full redeemable codes in the admin browser.
      for (const key of ['code_masked','max_redemptions','claims_count','consumed_count','is_disabled','created_at']) {
        td(tr, key === 'is_disabled' ? (item[key] ? 'معطّل' : 'فعّال') : item[key]);
      }
      // Admin action uses an opaque UUID, never the secret redeemable code.
      const actionCell = document.createElement('td');
      if (uuidRe.test(String(item.code_id || ''))) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = item.is_disabled ? 'إعادة تفعيل' : 'تعطيل';
        toggle.addEventListener('click', () => setCodeStatus(contestId, item.code_id, !item.is_disabled, toggle));
        actionCell.appendChild(toggle);
      } else actionCell.textContent = '—';
      tr.appendChild(actionCell);
      codeRows.appendChild(tr);
    }
    prev.disabled = offset === 0; next.disabled = data.length < codesPageSize;
    codeStatus.textContent = `${codesContestTitle} — عرض ${data.length} رمز، ابتداءً من ${offset + 1}. الرموز مخفية جزئياً للحماية.`;
  } catch (error) {
    if (request === codesRequest) codeStatus.textContent = 'تعذر تحميل الرموز: ' + (error?.message || 'خطأ غير معروف');
  }
}

async function setCodeStatus(contestId, codeId, disabled, button) {
  if (!uuidRe.test(String(contestId)) || !uuidRe.test(String(codeId))) return;
  const verb = disabled ? 'تعطيل' : 'إعادة تفعيل';
  if (!window.confirm(`${verb} هذا الرمز؟ لن تُحذف الجوائز المحفوظة سابقاً.`)) return;
  button.disabled = true;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await verifyAdmin(user))) throw new Error('صلاحية الإدارة غير متوفرة');
    const { error } = await supabase.rpc('ht_prize_admin_set_code_status', {
      p_contest_id: contestId, p_code_id: codeId, p_disabled: disabled
    });
    if (error) throw error;
    await loadCodes(contestId, codesContestTitle, codesOffset);
  } catch (error) {
    document.getElementById('codesStatus').textContent = 'تعذر تغيير حالة الرمز: ' + (error?.message || 'خطأ غير معروف');
  } finally { button.disabled = false; }
}

async function init() {
  if (!supabase) { status.textContent = 'إعداد Supabase غير متوفر'; return; }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !(await verifyAdmin(user))) { status.textContent = 'الدخول مرفوض: يجب تسجيل الدخول بحساب إدارة مخوّل'; return; }
  panel.hidden = false;
  document.getElementById('reportPanel').hidden = false;
  document.getElementById('createPanel').hidden = false;
  document.getElementById('createContest').addEventListener('submit', createContest);
  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('codesPanel').hidden = false;
  document.getElementById('codesPrev').addEventListener('click', () => { if (codesContestId) loadCodes(codesContestId, codesContestTitle, Math.max(0, codesOffset - codesPageSize)); });
  document.getElementById('codesNext').addEventListener('click', () => { if (codesContestId) loadCodes(codesContestId, codesContestTitle, codesOffset + codesPageSize); });
  await refresh();
}
async function createContest(event) {
  event.preventDefault();
  const button = document.getElementById('createButton');
  const storeId = document.getElementById('storeId').value.trim();
  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const start = new Date(document.getElementById('startsAt').value);
  const end = new Date(document.getElementById('endsAt').value);
  if (!uuidRe.test(storeId) || !title || title.length > 160 || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    writeStatus.textContent = 'راجع معرّف المتجر والعنوان والتواريخ.'; return;
  }
  if (!window.confirm('إنشاء مسابقة جديدة بحالة مسودة؟')) return;
  button.disabled = true;
  writeStatus.textContent = 'جاري الإنشاء…';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await verifyAdmin(user))) throw new Error('انتهت صلاحية جلسة الإدارة');
    // Dedicated admin-only RPC checks admin role and approved store on server.
    const { error } = await supabase.rpc('ht_prize_admin_create_contest', {
      p_store_id: storeId, p_title: title, p_description: description,
      p_starts_at: start.toISOString(), p_ends_at: end.toISOString(),
      p_show_when_exhausted: true
    });
    if (error) throw error;
    writeStatus.textContent = 'تم إنشاء المسابقة كمسودة.';
    document.getElementById('createContest').reset();
    await refresh();
  } catch (e) { writeStatus.textContent = 'تعذر الإنشاء: ' + (e?.message || 'خطأ غير معروف'); }
  finally { button.disabled = false; }
}
init().catch(e => { status.textContent = 'تعذر تحميل الشاشة: ' + (e?.message || 'خطأ غير معروف'); });
