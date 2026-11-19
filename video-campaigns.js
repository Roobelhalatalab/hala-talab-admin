import {supabase,verifyAdmin} from './supabase.js';
const $=id=>document.getElementById(id);
const status=msg=>{$('status').textContent=msg;};
const bucket='hala-video-campaigns';
let admin=false;
async function init(){
 if(!supabase){status('إعداد Supabase غير متوفر');return;}
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user||!(await verifyAdmin(user))){status('غير مصرح: سجّل الدخول إلى لوحة الإدارة بحساب إداري.');return;}
 admin=true;$('panel').hidden=false;$('listPanel').hidden=false;status('تم التحقق من صلاحيات الإدارة.');await refresh();
}
const validUuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!!u.hostname;}catch{return false;}};
async function refresh(){
 const {data,error}=await supabase.from('hala_video_campaigns').select('id,title,starts_at,ends_at,is_active').order('created_at',{ascending:false}).limit(100);
 if(error){status('تعذر تحميل الحملات: '+error.message);return;}
 const body=$('rows');body.replaceChildren();
 for(const c of data||[]){const tr=document.createElement('tr');for(const value of [c.title,new Date(c.starts_at).toLocaleString('ar-IQ'),new Date(c.ends_at).toLocaleString('ar-IQ'),c.is_active?'مفعلة':'متوقفة']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
 const td=document.createElement('td'),btn=document.createElement('button');btn.textContent=c.is_active?'إيقاف':'تفعيل';btn.onclick=async()=>{if(!admin)return;btn.disabled=true;const {error}=await supabase.from('hala_video_campaigns').update({is_active:!c.is_active,updated_at:new Date().toISOString()}).eq('id',c.id);if(error)status(error.message);await refresh();};td.append(btn);
 // Do not delete the database row directly: expiry lets the server-side
 // cleanup worker remove the Storage object before removing its record.
 const endBtn=document.createElement('button');
 endBtn.textContent='إيقاف الحملة الآن';
 endBtn.title='إخفاء الفيديو فوراً من التطبيق دون حذف الملف من التخزين';
 endBtn.onclick=async()=>{
  if(!admin||!confirm('إيقاف الحملة الآن؟ سيختفي الفيديو من العميل، ويبقى الملف محفوظاً لحين إعداد التنظيف لاحقاً.'))return;
  endBtn.disabled=true;
  const {error}=await supabase.from('hala_video_campaigns')
    .update({is_active:false,updated_at:new Date().toISOString()})
    .eq('id',c.id);
  if(error)status('تعذر إنهاء الحملة: '+error.message);
  else status('تم إيقاف الحملة. ملف الفيديو ما زال محفوظاً في Storage.');
  await refresh();
 };
 td.append(endBtn);tr.append(td);body.append(tr);}
}
$('form').addEventListener('submit',async e=>{
 e.preventDefault();if(!admin)return;const file=$('file').files[0],title=$('title').value.trim(),start=new Date($('start').value),end=new Date($('end').value),store=$('store').value.trim(),url=$('url').value.trim();
 if(!file||file.type!=='video/mp4'||file.size>20*1024*1024||file.size===0){status('اختر فيديو MP4 بحجم لا يتجاوز 20 ميغابايت');return;}
 if(!title||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start){status('راجع العنوان ووقت البداية والنهاية');return;}
 if(store&&!validUuid(store)){status('معرّف المتجر غير صحيح');return;}
 if(url&&!safeUrl(url)){status('استخدم رابط HTTPS صالحاً');return;}
 if(!store&&!url){status('حدد متجراً أو رابطاً خارجياً');return;}
 $('save').disabled=true;let path=null;let uploadSucceeded=false;
 try{
  path=`campaigns/${crypto.randomUUID()}.mp4`;
  const uploaded=await supabase.storage.from(bucket).upload(path,file,{contentType:'video/mp4',upsert:false});if(uploaded.error)throw uploaded.error;uploadSucceeded=true;
  const {error}=await supabase.from('hala_video_campaigns').insert({title,video_path:path,store_id:store||null,destination_url:url||null,starts_at:start.toISOString(),ends_at:end.toISOString(),is_active:$('active').checked});
  if(error)throw error;
  status('تم حفظ الحملة بنجاح.');$('form').reset();path=null;await refresh();
 }catch(err){
  // Do not attempt client-side Storage removal: authenticated DELETE is intentionally denied.
  // After an ambiguous network failure the upload may have succeeded even if no response arrived.
  // Retain the unique path for server-side reconciliation; never silently discard it.
  const orphanHint=path?`\nمسار الملف للمراجعة: ${path}`:'';
  status('تعذر حفظ الحملة: '+(err.message||String(err))+orphanHint+
    '\nقد يكون الفيديو مرفوعاً بدون سجل حملة. لا تعِد الرفع قبل مراجعة المسار مع الإدارة.');
  if(path)console.warn('Hala video upload needs server-side reconciliation', {path,uploadSucceeded});
 }
 finally{$('save').disabled=false;}
});
init().catch(e=>status('خطأ أثناء التحقق: '+e.message));
