import { supabase, isSupabaseConfigured } from './supabase.js';
import { APP_CONFIG } from './config.js';

const content = document.getElementById('menuContent');
const shareButton = document.getElementById('shareMenuBtn');
const copyButton = document.getElementById('copyMenuBtn');
const qrButton = document.getElementById('qrMenuBtn');
const qrModal = document.getElementById('qrModal');
const qrImage = document.getElementById('qrImage');
const qrLink = document.getElementById('qrLink');
const qrStoreName = document.getElementById('qrStoreName');
const ratingModal = document.getElementById('ratingModal');
const ratingTitle = document.getElementById('ratingTitle');
const ratingSubtitle = document.getElementById('ratingSubtitle');
const ratingStars = document.getElementById('ratingStars');
const ratingName = document.getElementById('ratingName');
const ratingComment = document.getElementById('ratingComment');
const ratingSubmit = document.getElementById('ratingSubmit');
const ratingMessage = document.getElementById('ratingMessage');

const TABLES = {
  stores: ['stores'],
  categories: ['product_categories', 'store_categories'],
  products: ['products', 'store_products', 'menu_items', 'store_menu_items'],
  storeRatings: ['store_ratings'],
  productRatings: ['product_ratings'],
};

const params = new URLSearchParams(location.search);
const requestedStore = (params.get('store') || params.get('restaurant') || '').trim();

const pick = (row, keys, fallback = null) => {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return fallback;
};
function text(value, depth = 0) {
  if (value === null || value === undefined || depth > 5) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (Array.isArray(value)) return value.map((v) => text(v, depth + 1)).filter(Boolean).join('، ');
  if (typeof value === 'object') {
    const preferred = ['name_ar','name','title','label','text','value','formatted_address','address','phone','description','about','bio','hours','working_hours','opening_hours'];
    for (const key of preferred) {
      if (value[key] !== undefined && value[key] !== null) {
        const out = text(value[key], depth + 1);
        if (out) return out;
      }
    }
    // Unknown structured value: keep it empty instead of leaking "[object Object]" to the UI.
    return '';
  }
  return '';
}
const escapeHtml = (value) => text(value).replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

// Stage 46: media fields in Supabase may be strings, JSON strings, or objects.
// Never stringify an object into "[object Object]"; resolve the actual URL instead.
function mediaUrl(value, depth = 0) {
  if (value === null || value === undefined || depth > 5) return '';
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v || v === '[object Object]') return '';
    if ((v.startsWith('{') || v.startsWith('['))) {
      try { return mediaUrl(JSON.parse(v), depth + 1); } catch (_) {}
    }
    return v;
  }
  if (Array.isArray(value)) {
    for (const item of value) { const u = mediaUrl(item, depth + 1); if (u) return u; }
    return '';
  }
  if (typeof value === 'object') {
    const keys = ['publicUrl','public_url','signedUrl','signed_url','url','src','image_url','imageUrl','logo_url','cover_url','path','location'];
    for (const key of keys) if (value[key] !== undefined) { const u = mediaUrl(value[key], depth + 1); if (u) return u; }
    for (const key of ['data','file','image','logo','cover','media','photo']) if (value[key] !== undefined) { const u = mediaUrl(value[key], depth + 1); if (u) return u; }
  }
  return '';
}
function nested(row, keys) {
  for (const key of keys) {
    const parts = key.split('.'); let cur = row;
    for (const part of parts) { if (cur == null || typeof cur !== 'object') { cur = undefined; break; } cur = cur[part]; }
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return null;
}
const boolValue = (value, fallback = true) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  if (['false','0','no','off','inactive','unavailable','disabled'].includes(normalized)) return false;
  if (['true','1','yes','on','active','available','enabled','approved'].includes(normalized)) return true;
  return fallback;
};
const money = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'غير محدد';
  return `${new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: number % 1 ? 2 : 0 }).format(number)} د.ع`;
};
const storeName = (r) => text(pick(r,['name','store_name','restaurant_name','business_name','name_ar'],'متجر'));
const storeLogo = (r) => mediaUrl(pick(r,['logo_url','logo','image_url','avatar_url','store_logo','profile_image','photo'],'') || '');
const storeCover = (r) => mediaUrl(pick(r,['cover_url','cover_image_url','cover_image','banner_url','header_image_url','banner','cover'],'') || '');
const storePhone = (r) => text(pick(r,['phone','phone_number','contact_phone'],'') || '');
const storeAddress = (r) => text(pick(r,['address','address_text','location_name','area'],'') || '');
const storeDescription = (r) => text(pick(r,['description','about','bio','store_description','restaurant_description'],'') || '');
const storeSlug = (r) => text(pick(r,['slug','menu_slug','public_slug'],'') || '');
const storeDeliveryFee = (r) => pick(r,['delivery_fee','shipping_fee','delivery_price'],null);
// Match the exact fields used by the client app first.
const storeDeliveryMinutes = (r) => pick(r,['preparation_minutes','delivery_minutes','estimated_delivery_minutes','delivery_time','estimated_delivery_time','delivery_duration'],null);
const storeOpeningTime = (r) => text(pick(r,['opening_time','open_time'],'') || '');
const storeClosingTime = (r) => text(pick(r,['closing_time','close_time'],'') || '');
const storeHours = (r) => {
  const opening=storeOpeningTime(r), closing=storeClosingTime(r);
  if (opening || closing) return [opening,closing].filter(Boolean).join(' - ');
  return text(pick(r,['working_hours','opening_hours','business_hours','hours'],'') || '');
};
const storeRating = (r) => { const n=Number(pick(r,['rating','average_rating','avg_rating'],0)); return Number.isFinite(n)?n:0; };
const storeReviewCount = (r) => { const n=Number(pick(r,['review_count','ratings_count','rating_count'],0)); return Number.isFinite(n)?Math.max(0,Math.trunc(n)):0; };
const storeBusinessType = (r) => text(pick(r,['category_name_ar','business_type','category_name','type'],'') || '');
const storeOpen = (r) => boolValue(pick(r,['is_open','open_now','is_open_now'],true),true);
const categoryName = (r) => text(pick(r,['name','name_ar','title','category_name'],'قسم'));
const categoryImage = (r) => mediaUrl(pick(r,['image_url','image','photo_url','category_image_url','thumbnail_url','icon_url'],'') || '');
const productName = (r) => text(pick(r,['name','name_ar','title','product_name'],'منتج'));
const productDescription = (r) => text(pick(r,['description','description_ar','details','product_description'],'') || '');
const productImage = (r) => mediaUrl(pick(r,['image_url','image','photo_url','product_image_url','thumbnail_url','images'],'') || '');
const productPrice = (r) => pick(r,['price','selling_price','sale_price','unit_price','base_price'],null);
const productStoreId = (r) => text(pick(r,['store_id','restaurant_id','merchant_id','partner_id'],'') || '');
const categoryStoreId = (r) => text(pick(r,['store_id','restaurant_id','merchant_id','partner_id'],'') || '');
const productCategoryId = (r) => text(pick(r,['category_id','product_category_id','store_category_id','section_id'], nested(r,['category.id','product_category.id','store_category.id','section.id'])) || '');
const productCategoryName = (r) => text(pick(r,['category_name','category_title','section_name'], nested(r,['category.name','category.name_ar','product_category.name','store_category.name','section.name'])) || '');
const rowId = (r) => text(pick(r,['id','uuid','product_id','category_id'],'') || '');

let state = { store:null, categories:[], products:[], groups:[], storeRatings:[], productRatings:[], ratingTables:{store:null,product:null}, activeView:'menu', activeCategory:null };
let ratingContext = null;
let selectedStars = 5;

async function firstReadableTable(candidates, options = {}) {
  const errors = [];
  for (const table of candidates) {
    let query = supabase.from(table).select('*');
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (!error) return { ok:true, table, rows:data || [], errors };
    errors.push(`${table}: ${error.message}`);
  }
  return { ok:false, table:null, rows:[], errors };
}

async function allReadableTables(candidates, options = {}) {
  const rows = [], tables = [], errors = [];
  for (const table of candidates) {
    let query = supabase.from(table).select('*');
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) { errors.push(`${table}: ${error.message}`); continue; }
    tables.push(table);
    for (const row of (data || [])) rows.push({...row, __menu_source_table: table});
  }
  return { ok: tables.length > 0, table: tables[0] || null, tables, rows, errors };
}

function storeVisible(row) {
  const status = text(pick(row,['status','review_status','approval_status'],'')).toLowerCase();
  const active = boolValue(pick(row,['is_active','active','enabled'],true),true);
  const blocked = ['rejected','suspended','blocked','deleted','closed_permanently'].includes(status);
  return active && !blocked;
}
function productAvailable(row) {
  const available = boolValue(pick(row,['is_available','available','in_stock'],true),true);
  const active = boolValue(pick(row,['is_active','active','enabled'],true),true);
  const status = text(pick(row,['status'],'')).toLowerCase();
  return available && active && !['disabled','deleted','hidden'].includes(status);
}
function categoryActive(row) { return boolValue(pick(row,['is_active','active','enabled'],true),true); }
function matchesStore(row, store) {
  const sid = rowId(store);
  const value = productStoreId(row) || categoryStoreId(row);
  if (!value) return true;
  return String(value) === String(sid);
}
function findStore(rows, wanted) {
  const lower = wanted.toLowerCase();
  return rows.find((r) => [rowId(r), storeSlug(r), storeName(r)].some((v) => text(v).toLowerCase() === lower)) || null;
}
function isLocalHost(hostname = location.hostname) { return ['localhost','127.0.0.1','::1'].includes(String(hostname).toLowerCase()); }
function publicBaseUrl() {
  const configured = text(APP_CONFIG?.publicMenuBaseUrl || '');
  if (configured) { try { return new URL(configured.endsWith('/') ? configured : `${configured}/`); } catch (_) {} }
  return new URL('./', location.href);
}
function storeMenuUrl(store) {
  const url = new URL('menu.html', publicBaseUrl());
  url.searchParams.set('store', storeSlug(store) || rowId(store));
  return url.href;
}
function publicLinkReady() { try { return !isLocalHost(new URL(storeMenuUrl({id:'preview'})).hostname); } catch (_) { return false; } }
function qrImageUrl(url) { return `https://quickchart.io/qr?size=360&margin=2&ecLevel=M&text=${encodeURIComponent(url)}`; }
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; }
  catch (_) {
    try { const input=document.createElement('textarea'); input.value=value; input.style.position='fixed'; input.style.opacity='0'; document.body.appendChild(input); input.select(); const ok=document.execCommand('copy'); input.remove(); return ok; }
    catch (_) { return false; }
  }
}
function showQr(store) { const url=storeMenuUrl(store); qrStoreName.textContent=storeName(store); qrLink.value=url; qrImage.src=qrImageUrl(url); qrImage.dataset.menuUrl=url; qrModal.hidden=false; document.body.classList.add('modal-open'); }
function closeQr() { qrModal.hidden=true; document.body.classList.remove('modal-open'); }
function bindQrDialog() {
  document.querySelectorAll('[data-close-qr]').forEach((el)=>el.addEventListener('click',closeQr));
  document.getElementById('qrCopyBtn')?.addEventListener('click',async(e)=>{const ok=await copyText(qrLink.value);const btn=e.currentTarget,old=btn.textContent;btn.textContent=ok?'تم النسخ':'تعذر النسخ';setTimeout(()=>btn.textContent=old,1400);});
  document.getElementById('qrOpenBtn')?.addEventListener('click',()=>{if(qrImage.src) window.open(qrImage.src,'_blank','noopener');});
  document.getElementById('qrPrintBtn')?.addEventListener('click',()=>{const w=window.open('','_blank','width=620,height=760');if(!w)return;w.document.write(`<html dir="rtl"><head><title>${escapeHtml(qrStoreName.textContent)}</title><style>body{font-family:Arial;text-align:center;padding:32px}img{width:360px;max-width:90%}p{direction:ltr;word-break:break-all}</style></head><body><h1>${escapeHtml(qrStoreName.textContent)}</h1><img src="${escapeHtml(qrImage.src)}"><p>${escapeHtml(qrLink.value)}</p><script>onload=()=>print()<\/script></body></html>`);w.document.close();});
}

function renderState(title,message,actionHtml='') { content.innerHTML=`<section class="state-card"><div class="state-icon">🍽️</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${actionHtml}</section>`; }

function renderStorePicker(stores) {
  document.title='اختر المطعم | هلا طلب'; shareButton.hidden=true; copyButton.hidden=true; qrButton.hidden=true;
  const visible=stores.filter(storeVisible).sort((a,b)=>storeName(a).localeCompare(storeName(b),'ar'));
  content.innerHTML=`<section class="store-picker-head"><h1>المنيو الإلكتروني</h1><p>اختر المطعم لعرض أقسام قائمته.</p></section>${!publicLinkReady()?'<div class="local-link-notice">وضع الفحص المحلي: الروابط تعمل على هذا الجهاز فقط.</div>':''}${visible.length?`<div class="stores-grid">${visible.map((store)=>{const logo=storeLogo(store),url=storeMenuUrl(store);return `<article class="store-card-wrap"><a class="store-card" href="${escapeHtml(url)}">${logo?`<img src="${escapeHtml(logo)}" alt="${escapeHtml(storeName(store))}" loading="lazy">`:`<span class="store-card-logo">${escapeHtml(storeName(store).slice(0,1)||'هـ')}</span>`}<span class="store-card-text"><h3>${escapeHtml(storeName(store))}</h3><p>${escapeHtml(storeAddress(store)||'عرض المنيو')}</p></span></a><div class="store-card-tools"><button type="button" class="mini-action" data-copy-store="${escapeHtml(url)}">نسخ الرابط</button><button type="button" class="mini-action qr-action" data-qr-store="${escapeHtml(rowId(store))}">QR</button></div></article>`;}).join('')}</div>`:'<div class="empty-products">لا توجد متاجر متاحة للعرض حاليًا.</div>'}`;
  content.querySelectorAll('[data-copy-store]').forEach((btn)=>btn.addEventListener('click',async()=>{const ok=await copyText(btn.dataset.copyStore);const old=btn.textContent;btn.textContent=ok?'تم النسخ':'تعذر النسخ';setTimeout(()=>btn.textContent=old,1400);}));
  content.querySelectorAll('[data-qr-store]').forEach((btn)=>btn.addEventListener('click',()=>{const store=visible.find((s)=>rowId(s)===btn.dataset.qrStore);if(store)showQr(store);}));
}

function ratingAverage(rows) {
  const nums=rows.map((r)=>Number(pick(r,['rating','stars','score'],0))).filter((n)=>n>=1&&n<=5);
  if(!nums.length)return {avg:0,count:0};
  return {avg:nums.reduce((a,b)=>a+b,0)/nums.length,count:nums.length};
}
function starsText(avg){ return avg ? `★ ${avg.toFixed(1)}` : '☆ 0.0'; }
function formatDeliveryTime(value){
  if(value===null||value===undefined||value==='') return 'غير محدد';
  const n=Number(value);
  if(Number.isFinite(n)) return `${Math.max(0,Math.trunc(n))} دقيقة`;
  const v=text(value);
  if(!v)return 'غير محدد';
  return /^\d+$/.test(v)?`${v} دقيقة`:v;
}
function formatDeliveryFee(value){
  const n=Number(value);
  if(Number.isFinite(n)){
    if(n<=0) return 'مجاني';
    return money(n);
  }
  return 'غير محدد';
}
function heroRating(store){
  const direct=storeRating(store), directCount=storeReviewCount(store);
  if(direct>0 || directCount>0) return {avg:direct,count:directCount};
  return ratingAverage(state.storeRatings);
}

function renderHero(store) {
  const logo=storeLogo(store),address=storeAddress(store),avg=heroRating(store);
  const deliveryTime=formatDeliveryTime(storeDeliveryMinutes(store));
  const deliveryFee=formatDeliveryFee(storeDeliveryFee(store));
  const hours=storeHours(store)||'غير محدد';
  const businessType=storeBusinessType(store)||'عرض التفاصيل';
  const firstFood=state.products.find((p)=>productImage(p));
  const hero=storeCover(store)||productImage(firstFood||{})||logo;
  return `<section class="client-style-hero">
    <div class="hero-cover ${hero?'':'hero-cover-empty'}" ${hero?`style="background-image:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.28)),url('${escapeHtml(hero)}')"`:''}></div>
    <div class="store-profile-card">
      <div class="store-identity">${logo?`<img class="store-logo" src="${escapeHtml(logo)}" alt="شعار ${escapeHtml(storeName(store))}">`:`<span class="store-logo store-logo-fallback">${escapeHtml(storeName(store).slice(0,1)||'هـ')}</span>`}<div><div class="store-title-row"><h1>${escapeHtml(storeName(store))}</h1><span class="open-pill ${storeOpen(store)?'open':'closed'}">${storeOpen(store)?'مفتوح الآن':'مغلق الآن'}</span></div><p>${escapeHtml(address||'المطعم')}</p></div></div>
      <div class="info-grid client-info-grid">
        <button class="info-card info-card-button" type="button" data-jump-view="ratings"><span class="info-icon">★</span><span>التقييم</span><strong>${avg.avg?avg.avg.toFixed(1):'0.0'}</strong><small>${avg.count} تقييم</small></button>
        <div class="info-card"><span class="info-icon">◷</span><span>وقت التوصيل</span><strong>${escapeHtml(deliveryTime)}</strong><small>تقريبي</small></div>
        <div class="info-card"><span class="info-icon">🛵</span><span>رسوم التوصيل</span><strong>${escapeHtml(deliveryFee)}</strong></div>
        <button class="info-card info-card-button" type="button" data-jump-view="info"><span class="info-icon">ⓘ</span><span>معلومات المطعم</span><strong>عرض التفاصيل</strong><small>العنوان والهاتف</small></button>
        <div class="info-card hours-card"><span class="info-icon">◷</span><span>ساعات العمل</span><strong>${escapeHtml(hours)}</strong></div>
      </div>
      ${storeDescription(store)?`<p class="store-description">${escapeHtml(storeDescription(store))}</p>`:''}
    </div>
  </section>`;
}

function makeGroups(store,categories,products){
  const storeProducts=products.filter((r)=>matchesStore(r,store));
  const storeCategories=categories.filter((r)=>matchesStore(r,store)&&categoryActive(r));
  const sortValue=(r)=>Number(pick(r,['sort_order','display_order','order','position'],999));
  const normalized=(v)=>text(v).toLocaleLowerCase('ar').replace(/\s+/g,' ');
  const groups=[];
  const usedProducts=new Set();

  for (const category of storeCategories.sort((a,b)=>sortValue(a)-sortValue(b))) {
    const cid=rowId(category), cname=normalized(categoryName(category));
    const linked=storeProducts.filter((p)=>{
      const pid=productCategoryId(p), pname=normalized(productCategoryName(p));
      const match=(cid&&pid&&String(pid)===String(cid)) || (cname&&pname&&cname===pname);
      if(match) usedProducts.add(rowId(p)||`${productName(p)}-${productPrice(p)}`);
      return match;
    });
    if(linked.length) groups.push({category,products:linked});
  }

  // Fallback for public menu: if category rows are blocked by RLS or a product stores
  // its category as a nested object/name, rebuild the same sections from product data.
  const fallback=new Map();
  for (const p of storeProducts) {
    const keyId=productCategoryId(p), keyName=productCategoryName(p);
    const productKey=rowId(p)||`${productName(p)}-${productPrice(p)}`;
    if(usedProducts.has(productKey)) continue;
    if(!keyId&&!keyName) continue;
    const key=keyId?`id:${keyId}`:`name:${normalized(keyName)}`;
    if(!fallback.has(key)) fallback.set(key,{category:{id:keyId||`virtual-${fallback.size+1}`,name:keyName||'قسم',is_active:true,__virtual:true},products:[]});
    fallback.get(key).products.push(p);
  }
  groups.push(...fallback.values());

  // De-duplicate categories that may be readable from both product_categories and store_categories.
  const unique=[]; const seen=new Set();
  for(const g of groups){const key=rowId(g.category)?`id:${rowId(g.category)}`:`name:${normalized(categoryName(g.category))}`;if(seen.has(key))continue;seen.add(key);unique.push(g);}
  return unique;
}

function categoryCardImage(group){ return categoryImage(group.category)||productImage(group.products.find((p)=>productImage(p))||{}); }

function renderMenuShell(){
  const store=state.store;
  content.innerHTML=`${renderHero(store)}
    <nav class="main-tabs" aria-label="أقسام صفحة المطعم">
      <button class="main-tab active" type="button" data-view="menu">القائمة</button>
      <button class="main-tab" type="button" data-view="ratings">التقييمات</button>
      <button class="main-tab" type="button" data-view="info">معلومات المطعم</button>
    </nav>
    <section id="viewContent" class="view-content"></section>`;
  content.querySelectorAll('[data-view]').forEach((btn)=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
  content.querySelectorAll('[data-jump-view]').forEach((btn)=>btn.addEventListener('click',()=>switchView(btn.dataset.jumpView)));
  switchView('menu');
}

function switchView(view){
  state.activeView=view; state.activeCategory=null;
  content.querySelectorAll('.main-tab').forEach((b)=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='menu') renderCategoriesView();
  else if(view==='ratings') renderRatingsView();
  else renderInfoView();
}

function renderCategoriesView(){
  const host=document.getElementById('viewContent'); if(!host)return;
  const total=state.groups.length;
  host.innerHTML=`<div class="search-wrap section-search"><span class="search-icon">⌕</span><input id="categorySearch" type="search" placeholder="ابحث داخل قائمة المطعم..." autocomplete="off"></div>
    <div class="section-head"><div><h2>أقسام القائمة</h2><p>اختر قسمًا لعرض المنتجات الموجودة داخله فقط</p></div><span>${total} قسم</span></div>
    <div id="categoriesGrid" class="categories-grid">${total?state.groups.map(renderCategoryCard).join(''):'<div class="empty-products">لا توجد أقسام تحتوي على منتجات حاليًا.</div>'}</div>`;
  host.querySelectorAll('[data-open-category]').forEach((card)=>card.addEventListener('click',()=>openCategory(card.dataset.openCategory)));
  document.getElementById('categorySearch')?.addEventListener('input',(e)=>filterCategories(e.target.value));
}
function renderCategoryCard(group){
  const id=rowId(group.category),img=categoryCardImage(group),search=`${categoryName(group.category)} ${group.products.map(productName).join(' ')}`.toLowerCase();
  return `<button class="category-card" type="button" data-open-category="${escapeHtml(id)}" data-category-search="${escapeHtml(search)}">
    <div class="category-card-media ${img?'':'no-image'}">${img?`<img src="${escapeHtml(img)}" alt="${escapeHtml(categoryName(group.category))}" loading="lazy">`:'🍽️'}</div>
    <div class="category-card-body"><div><h3>${escapeHtml(categoryName(group.category))}</h3><p>${group.products.length} منتج</p></div><span class="category-arrow">‹</span></div>
  </button>`;
}
function filterCategories(value){ const q=text(value).toLowerCase(); document.querySelectorAll('[data-category-search]').forEach((card)=>{card.hidden=!!q&&!card.dataset.categorySearch.includes(q);}); }

function openCategory(categoryId){
  const group=state.groups.find((g)=>rowId(g.category)===String(categoryId)); if(!group)return;
  state.activeCategory=categoryId;
  const host=document.getElementById('viewContent');
  host.innerHTML=`<div class="category-nav-row"><button id="backCategories" class="back-btn" type="button" aria-label="الرجوع إلى الأقسام"><span class="back-icon">→</span><span>رجوع إلى الأقسام</span></button></div>
    <div class="category-detail-head"><div><h2>${escapeHtml(categoryName(group.category))}</h2><p>${group.products.length} منتج</p></div></div>
    <div class="search-wrap section-search"><span class="search-icon">⌕</span><input id="productSearch" type="search" placeholder="ابحث داخل ${escapeHtml(categoryName(group.category))}..." autocomplete="off"></div>
    <div id="productsGrid" class="products-grid">${group.products.map(renderProduct).join('')}</div>`;
  document.getElementById('backCategories')?.addEventListener('click',()=>{state.activeCategory=null;renderCategoriesView();window.scrollTo({top:document.querySelector('.main-tabs')?.offsetTop||0,behavior:'smooth'});});
  document.getElementById('productSearch')?.addEventListener('input',(e)=>filterProducts(e.target.value));
  host.querySelectorAll('[data-rate-product]').forEach((btn)=>btn.addEventListener('click',()=>{const p=group.products.find((x)=>rowId(x)===btn.dataset.rateProduct); if(p) openRating('product',p);}));
}

function productRatingsFor(product){ const id=rowId(product); return state.productRatings.filter((r)=>String(pick(r,['product_id'],'')||'')===String(id)); }
function renderProduct(product){
  const image=productImage(product),available=productAvailable(product),name=productName(product),avg=ratingAverage(productRatingsFor(product));
  return `<article class="product-card" data-product-card data-search="${escapeHtml(`${name} ${productDescription(product)}`.toLowerCase())}">
    <div class="product-media ${image?'':'no-image'}">${image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy">`:'🍽️'}${available?'':`<span class="availability-badge off">غير متوفر</span>`}</div>
    <div class="product-body"><div class="product-head"><h3>${escapeHtml(name)}</h3><strong class="product-price">${money(productPrice(product))}</strong></div>${productDescription(product)?`<p class="product-desc">${escapeHtml(productDescription(product))}</p>`:''}<div class="product-rating-row"><span>${starsText(avg.avg)} <small>(${avg.count})</small></span><button type="button" class="rate-link" data-rate-product="${escapeHtml(rowId(product))}">قيّم الوجبة</button></div></div>
  </article>`;
}
function filterProducts(value){ const q=text(value).toLowerCase(); document.querySelectorAll('[data-product-card]').forEach((card)=>{card.hidden=!!q&&!card.dataset.search.includes(q);}); }

function renderRatingsView(){
  const host=document.getElementById('viewContent'); if(!host)return;
  const avg=ratingAverage(state.storeRatings),enabled=Boolean(state.ratingTables.store);
  const rows=[...state.storeRatings].sort((a,b)=>new Date(pick(b,['created_at'],0))-new Date(pick(a,['created_at'],0))).slice(0,30);
  host.innerHTML=`<div class="ratings-summary"><div class="rating-big">${avg.avg?avg.avg.toFixed(1):'0.0'}</div><div><div class="stars-static">${'★'.repeat(Math.round(avg.avg))}${'☆'.repeat(5-Math.round(avg.avg))}</div><p>${avg.count} تقييم للمطعم</p><small class="rating-help">يمكنك تقييم المطعم، وتقييم كل وجبة من داخل قسمها.</small></div>${enabled?'<button id="rateStoreBtn" class="primary-btn" type="button">إضافة تقييم</button>':'<span class="setup-note">التقييمات تحتاج تفعيل قاعدة البيانات مرة واحدة.</span>'}</div>
    <div class="reviews-list">${rows.length?rows.map(renderReview).join(''):'<div class="empty-products">لا توجد تقييمات بعد.</div>'}</div>`;
  document.getElementById('rateStoreBtn')?.addEventListener('click',()=>openRating('store',state.store));
}
function renderReview(row){ const stars=Math.max(1,Math.min(5,Number(pick(row,['rating','stars','score'],5))||5)),name=text(pick(row,['reviewer_name','name'],'زائر'))||'زائر',comment=text(pick(row,['comment','review_text','notes'],'')||'');return `<article class="review-card"><div class="review-head"><strong>${escapeHtml(name)}</strong><span>${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</span></div>${comment?`<p>${escapeHtml(comment)}</p>`:''}</article>`; }

function renderInfoView(){
  const s=state.store,host=document.getElementById('viewContent'); if(!host)return;
  host.innerHTML=`<div class="info-page-grid"><article class="info-panel"><h2>معلومات المطعم</h2><div class="info-list"><div><span>الاسم</span><strong>${escapeHtml(storeName(s))}</strong></div><div><span>العنوان</span><strong>${escapeHtml(storeAddress(s)||'غير محدد')}</strong></div><div><span>الهاتف</span><strong>${escapeHtml(storePhone(s)||'غير محدد')}</strong></div><div><span>ساعات العمل</span><strong>${escapeHtml(storeHours(s)||'غير محدد')}</strong></div><div><span>وقت التوصيل</span><strong>${escapeHtml(formatDeliveryTime(storeDeliveryMinutes(s)))}</strong></div><div><span>رسوم التوصيل</span><strong>${escapeHtml(formatDeliveryFee(storeDeliveryFee(s)))}</strong></div></div>${storeDescription(s)?`<p class="about-text">${escapeHtml(storeDescription(s))}</p>`:''}</article></div>`;
}

function getVisitorId(){
  const key='hala_menu_visitor_id'; let id='';
  try{id=localStorage.getItem(key)||'';}catch(_){}
  if(!id){id=(crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`);try{localStorage.setItem(key,id);}catch(_){}}
  return id;
}
function drawStars(){
  if(!ratingStars)return; ratingStars.innerHTML=[1,2,3,4,5].map((n)=>`<button type="button" class="star-btn ${n<=selectedStars?'selected':''}" data-star="${n}" aria-label="${n} نجوم">★</button>`).join('');
  ratingStars.querySelectorAll('[data-star]').forEach((b)=>b.addEventListener('click',()=>{selectedStars=Number(b.dataset.star);drawStars();}));
}
function openRating(type,target){
  const table=type==='store'?state.ratingTables.store:state.ratingTables.product;
  if(!table){alert('التقييمات غير مفعلة بعد. شغّل ملف SQL المرفق مرة واحدة في Supabase.');return;}
  ratingContext={type,target,table}; selectedStars=5; ratingTitle.textContent=type==='store'?'قيّم المطعم':'قيّم الوجبة'; ratingSubtitle.textContent=type==='store'?storeName(target):productName(target); ratingName.value=''; ratingComment.value=''; ratingMessage.innerHTML=''; drawStars(); ratingModal.hidden=false; document.body.classList.add('modal-open');
}
function closeRating(){ratingModal.hidden=true;ratingContext=null;document.body.classList.remove('modal-open');}
async function submitRating(){
  if(!ratingContext)return;
  const btn=ratingSubmit; btn.disabled=true; btn.textContent='جارٍ الحفظ...'; ratingMessage.innerHTML='';
  const base={visitor_id:getVisitorId(),rating:selectedStars,reviewer_name:text(ratingName.value)||null,comment:text(ratingComment.value)||null,updated_at:new Date().toISOString()};
  if(ratingContext.type==='store')base.store_id=rowId(state.store);
  else {base.store_id=rowId(state.store);base.product_id=rowId(ratingContext.target);}
  const {error}=await supabase.from(ratingContext.table).insert(base);
  btn.disabled=false; btn.textContent='إرسال التقييم';
  if(error){
    const duplicate=String(error.code||'')==='23505' || /duplicate|unique/i.test(String(error.message||''));
    ratingMessage.innerHTML=duplicate?'<div class="form-error">تم تسجيل تقييم من هذا الجهاز لهذا العنصر مسبقًا.</div>':`<div class="form-error">تعذر حفظ التقييم: ${escapeHtml(error.message)}</div>`;
    return;
  }
  ratingMessage.innerHTML='<div class="form-success">تم حفظ تقييمك بنجاح.</div>';
  await refreshRatings();
  setTimeout(()=>{closeRating(); if(state.activeView==='ratings')renderRatingsView(); else if(state.activeCategory)openCategory(state.activeCategory);},700);
}
function bindRatingDialog(){ document.querySelectorAll('[data-close-rating]').forEach((el)=>el.addEventListener('click',closeRating)); ratingSubmit?.addEventListener('click',submitRating); }

async function refreshRatings(){
  if(!state.store)return;
  if(state.ratingTables.store){const {data}=await supabase.from(state.ratingTables.store).select('*').eq('store_id',rowId(state.store)).limit(500);state.storeRatings=data||[];}
  if(state.ratingTables.product){const {data}=await supabase.from(state.ratingTables.product).select('*').eq('store_id',rowId(state.store)).limit(3000);state.productRatings=data||[];}
}

async function renderMenu(store,categories,products){
  document.title=`${storeName(store)} | المنيو الإلكتروني`; shareButton.hidden=false; copyButton.hidden=false; qrButton.hidden=false;
  const canonicalUrl=storeMenuUrl(store);
  copyButton.onclick=async()=>{const ok=await copyText(canonicalUrl),old=copyButton.textContent;copyButton.textContent=ok?'تم النسخ':'تعذر النسخ';setTimeout(()=>copyButton.textContent=old,1400);};
  qrButton.onclick=()=>showQr(store);
  shareButton.onclick=async()=>{try{if(navigator.share)await navigator.share({title:storeName(store),text:`منيو ${storeName(store)}`,url:canonicalUrl});else await copyText(canonicalUrl);}catch(_){}};
  state.store=store;state.categories=categories;state.products=products;state.groups=makeGroups(store,categories,products);
  const [sr,pr]=await Promise.all([firstReadableTable(TABLES.storeRatings,{limit:1}),firstReadableTable(TABLES.productRatings,{limit:1})]);
  state.ratingTables={store:sr.ok?sr.table:null,product:pr.ok?pr.table:null};
  await refreshRatings(); renderMenuShell();
}

let realtimeChannel=null,reloadTimer=null;
async function loadPublicMenu(){
  if(!isSupabaseConfigured()||!supabase){renderState('الربط غير مكتمل','لم يتم إعداد اتصال Supabase في هذه النسخة بعد.');return null;}
  const storesResult=await firstReadableTable(TABLES.stores,{limit:5000});
  if(!storesResult.ok){renderState('تعذر تحميل المتاجر','تأكد من اتصال الإنترنت وسياسات القراءة العامة في Supabase.');console.warn(storesResult.errors);return null;}
  if(!requestedStore){renderStorePicker(storesResult.rows);return {storesTable:storesResult.table,categoryTable:null,productTable:null};}
  const store=findStore(storesResult.rows,requestedStore);
  if(!store){renderState('المطعم غير موجود','الرابط غير صحيح أو أن المطعم لم يعد متاحًا.',`<p style="margin-top:16px"><a class="primary-btn" href="./menu.html" style="display:inline-block;text-decoration:none">عرض المطاعم</a></p>`);return null;}
  const [categoryResult,productResult]=await Promise.all([allReadableTables(TABLES.categories,{limit:5000}),firstReadableTable(TABLES.products,{limit:10000})]);
  if(!productResult.ok){renderState('تعذر قراءة المنتجات','جدول المنتجات غير متاح للقراءة العامة حاليًا.');return null;}
  await renderMenu(store,categoryResult.rows||[],productResult.rows||[]);
  return {storesTable:storesResult.table,categoryTable:categoryResult.table,categoryTables:categoryResult.tables||[],productTable:productResult.table};
}
function scheduleRealtimeReload(){clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadPublicMenu().catch(console.error),500);}
function enableRealtime(tables){if(!requestedStore||!tables||!supabase)return;const unique=[...new Set([tables.storesTable,...(tables.categoryTables||[]),tables.categoryTable,tables.productTable].filter(Boolean))];if(!unique.length)return;try{if(realtimeChannel)supabase.removeChannel(realtimeChannel);let channel=supabase.channel(`public-menu-${requestedStore}-${Date.now()}`);unique.forEach((table)=>{channel=channel.on('postgres_changes',{event:'*',schema:'public',table},scheduleRealtimeReload);});realtimeChannel=channel.subscribe();}catch(error){console.warn('Realtime unavailable:',error);}}
async function init(){const tables=await loadPublicMenu();enableRealtime(tables);}

bindQrDialog();bindRatingDialog();
init().catch((error)=>{console.error(error);renderState('حدث خطأ غير متوقع','أعد تحميل الصفحة. إذا استمرت المشكلة، راجع اتصال Supabase.');});
