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
  const { data, error } = await supabase.rpc('ht_prize_admin_list_contests_v2');
  if (error) { status.textContent = 'خدمة المسابقات غير جاهزة أو لا توجد صلاحية: ' + error.message; return; }
  if (!Array.isArray(data)) { status.textContent = 'استجابة غير متوقعة من الخادم'; return; }
  for (const item of data) {
    const row = document.createElement('tr');
    const imageCell = document.createElement('td');
    if (item.image_path && uuidRe.test(String(item.store_id)) && String(item.image_path).startsWith(item.store_id + '/contests/')) { const img = document.createElement('img'); img.src = supabase.storage.from('product-images').getPublicUrl(item.image_path).data.publicUrl; img.alt = 'صورة المسابقة'; imageCell.appendChild(img); } else imageCell.textContent = '—';
    row.appendChild(imageCell);
    for (const key of ['title','store_name','status','starts_at','ends_at']) td(row,item?.[key]);
    const actions = document.createElement('td');
    const current = String(item?.status ?? '');
    const next = current === 'active' ? 'paused' : ['draft','paused'].includes(current) ? 'active' : null;
    if (next && uuidRe.test(String(item?.id ?? ''))) {
      const button = document.createElement('button');
      button.textContent = next === 'paused' ? 'إيقاف مؤقت' : current === 'draft' ? 'تفعيل المسابقة' : 'إعادة تفعيل';
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
      const review = document.createElement('button'); review.type='button'; review.textContent='تسليم الجوائز / الإلغاء'; review.addEventListener('click',()=>loadFulfillment(item.id)); actions.appendChild(review);
    }
    if (uuidRe.test(String(item.id)) && uuidRe.test(String(item.store_id))) {
      for (const [mode,label] of [['image','تغيير الصورة'],['end','تمديد المسابقة']]) { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click',()=>openEdit(item,mode)); actions.appendChild(b); }
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
  document.getElementById('zoneFilter').addEventListener('change',renderStores);
  document.getElementById('storeSearch').addEventListener('input',renderStores);
  document.getElementById('contestImage').addEventListener('change',previewImage);
  document.getElementById('editForm').addEventListener('submit',saveEdit);
  document.getElementById('editCancel').addEventListener('click',()=>document.getElementById('editDialog').close());
  await Promise.all([refresh(),loadStores()]);
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
    writeStatus.textContent = 'راجع اختيار المتجر والعنوان والتواريخ.'; return;
  }
  if (!window.confirm('إنشاء مسابقة جديدة بحالة مسودة؟')) return;
  button.disabled = true;
  writeStatus.textContent = 'جاري الإنشاء…';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !(await verifyAdmin(user))) throw new Error('انتهت صلاحية جلسة الإدارة');
    // Dedicated admin-only RPC checks admin role and approved store on server.
    const file = document.getElementById('contestImage').files[0];
    if (!file) throw new Error('أضف صورة المسابقة');
    const path = await uploadImage(storeId,file);
    const { error } = await supabase.rpc('ht_prize_admin_create_contest_with_image', {
      p_store_id: storeId, p_title: title, p_description: description,
      p_starts_at: start.toISOString(), p_ends_at: end.toISOString(),
      p_show_when_exhausted: el('showExhausted').value === 'true', p_image_path: path
    });
    if (error) throw error;
    writeStatus.textContent = 'تم إنشاء المسابقة كمسودة.';
    document.getElementById('createContest').reset(); previewImage(); renderStores();
    await refresh();
  } catch (e) { writeStatus.textContent = 'تعذر الإنشاء: ' + (e?.message || 'خطأ غير معروف'); }
  finally { button.disabled = false; }
}
let stores=[], zones=[], previewUrl=null, editItem=null, editMode=null;
const el=id=>document.getElementById(id);
async function requireAdmin(){const {data:{user},error}=await supabase.auth.getUser(); if(error||!user||!(await verifyAdmin(user))) throw new Error('صلاحية الإدارة غير متوفرة');}
async function loadStores(){
  try { await requireAdmin(); const z=await supabase.from('hala_zones').select('id,name'); if(z.error) throw z.error; zones=z.data||[];
    const all=[]; for(let offset=0;;offset+=500){const r=await supabase.from('stores').select('id,name,zone_id').eq('is_active',true).eq('approval_status','approved').order('id').range(offset,offset+499); if(r.error)throw r.error; all.push(...r.data); if(r.data.length<500)break;}
    stores=all.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar')); for(const zone of zones)el('zoneFilter').add(new Option(zone.name,zone.id)); renderStores();
  } catch(e){el('storeStatus').textContent='تعذر تحميل المتاجر: '+e.message; el('storeId').disabled=true;}
}
function renderStores(){const select=el('storeId'), old=select.value, zone=el('zoneFilter').value, q=el('storeSearch').value.trim().toLowerCase(); const filtered=stores.filter(s=>(zone==='all'||s.zone_id===zone)&&String(s.name).toLowerCase().includes(q)); select.replaceChildren(new Option('اختر المتجر','')); for(const s of filtered)select.add(new Option(s.name+' — '+(zones.find(z=>z.id===s.zone_id)?.name||'غير محدد'),s.id)); if(filtered.some(s=>s.id===old))select.value=old; select.disabled=!filtered.length; el('storeStatus').textContent=filtered.length?'عدد المتاجر: '+filtered.length:'لا توجد متاجر مطابقة';}
function validateImage(file){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]; if(!ext||!file.size||file.size>5*1024*1024)throw new Error('اختر صورة JPG أو PNG أو WebP حتى 5 ميغابايت'); return ext;}
function previewImage(){if(previewUrl)URL.revokeObjectURL(previewUrl); previewUrl=null; const img=el('imagePreview'); img.hidden=true; img.removeAttribute('src'); const file=el('contestImage').files[0]; if(!file)return; try{validateImage(file);previewUrl=URL.createObjectURL(file);img.src=previewUrl;img.hidden=false;}catch(e){el('contestImage').value='';writeStatus.textContent=e.message;}}
async function uploadImage(storeId,file){const ext=validateImage(file); const path=storeId+'/contests/'+crypto.randomUUID()+'.'+ext; const {error}=await supabase.storage.from('product-images').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return path;}
function openEdit(item,mode){editItem=item;editMode=mode;el('editForm').reset();el('editStatus').textContent='';el('editTitle').textContent=(mode==='image'?'تغيير الصورة: ':'تمديد المسابقة: ')+item.title;el('editImageLabel').hidden=mode!=='image';el('editEndLabel').hidden=mode!=='end';el('editImageLabel').style.display=mode==='image'?'grid':'none';el('editEndLabel').style.display=mode==='end'?'grid':'none';el('editImage').required=mode==='image';el('editEnd').required=mode==='end';el('editDialog').showModal();}
async function saveEdit(event){event.preventDefault();const b=el('editSave');b.disabled=true;el('editCancel').disabled=true;try{await requireAdmin();let result;if(editMode==='image'){const path=await uploadImage(editItem.store_id,el('editImage').files[0]);result=await supabase.rpc('ht_prize_admin_set_contest_image',{p_contest_id:editItem.id,p_image_path:path});}else{const end=new Date(el('editEnd').value);if(!Number.isFinite(end.getTime())||end<=new Date(editItem.ends_at)||end<=new Date())throw new Error('اختر تاريخاً بعد النهاية الحالية والوقت الحالي');result=await supabase.rpc('ht_prize_admin_extend_contest',{p_contest_id:editItem.id,p_ends_at:end.toISOString()});}if(result.error)throw result.error;el('editDialog').close();await refresh();}catch(e){el('editStatus').textContent='تعذر الحفظ: '+e.message;}finally{b.disabled=false;el('editCancel').disabled=false;}}
const observer=new MutationObserver(()=>{for(const table of document.querySelectorAll('table')){const labels=[...table.querySelectorAll('th')].map(x=>x.textContent);for(const row of table.querySelectorAll('tbody tr'))[...row.cells].forEach((cell,i)=>{if(cell.dataset.label!==labels[i])cell.dataset.label=labels[i]||'';});}});observer.observe(document.querySelector('main'),{childList:true,subtree:true});
init().catch(e => { status.textContent = 'تعذر تحميل الشاشة: ' + (e?.message || 'خطأ غير معروف'); });

let fulfillmentRequest=0;
async function loadFulfillment(contestId) {
  const request=++fulfillmentRequest; const section=el('fulfillmentPanel'), status=el('fulfillmentStatus'), rows=el('fulfillmentRows');
  section.hidden=false; rows.replaceChildren(); status.textContent='جاري تحميل الطلبات…';
  try {
    await requireAdmin();
    const {data,error}=await supabase.rpc('ht_prize_admin_fulfillment_queue',{p_contest_id:contestId}); if(error)throw error;
    if(request!==fulfillmentRequest)return;
    status.textContent=data.length?'اختر الطلب بعد التحقق الفعلي':'لا توجد طلبات تحتاج التحقق';
    for(const item of data){
      const box=document.createElement('div'); const desc=document.createElement('p'); desc.textContent=`طلب ${item.order_number} — ${item.prize_title} — ${item.order_status}`; box.appendChild(desc);
      const delivered=item.order_status==='delivered'; const evidence=document.createElement('textarea'); evidence.placeholder='دوّن دليل التحقق الفعلي (12 حرفاً على الأقل)'; evidence.maxLength=1000; box.appendChild(evidence);
      const button=document.createElement('button'); button.type='button'; button.textContent=delivered?'تأكيد تسليم الجائزة':'إرجاع الجائزة بعد التحقق من عدم التسليم'; box.appendChild(button);
      button.addEventListener('click',async()=>{
        const reason=evidence.value.trim(); if(reason.length<12){status.textContent='اكتب دليل التحقق أولاً';return;}
        if(!window.confirm(delivered?'هل تحققت فعلياً من تسليم الجائزة؟':'هل تحققت فعلياً من عدم تسليم الجائزة؟ ستعود الجائزة لنفس العميل.'))return;
        button.disabled=true; try{await requireAdmin(); const r=await supabase.rpc('ht_prize_admin_verify_fulfillment',{p_contest_id:contestId,p_order_id:item.order_id,p_delivered:delivered,p_evidence:reason});if(r.error)throw r.error; if(request===fulfillmentRequest)await loadFulfillment(contestId);}
        catch(e){if(request===fulfillmentRequest)status.textContent='تعذر التحقق: '+e.message;} finally{button.disabled=false;}
      }); rows.appendChild(box);
    }
  }catch(e){if(request===fulfillmentRequest)status.textContent='تعذر تحميل الطلبات: '+e.message;}
}
