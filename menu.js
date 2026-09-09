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

const TABLES = {
  stores: ['stores'],
  categories: ['product_categories', 'store_categories'],
  products: ['products', 'store_products', 'menu_items', 'store_menu_items'],
};

const params = new URLSearchParams(location.search);
const requestedStore = (params.get('store') || params.get('restaurant') || '').trim();

const pick = (row, keys, fallback = null) => {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return fallback;
};
const text = (value) => String(value ?? '').trim();
const escapeHtml = (value) => text(value).replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
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
  if (!Number.isFinite(number)) return '—';
  return `${new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: number % 1 ? 2 : 0 }).format(number)} د.ع`;
};
const storeName = (r) => text(pick(r,['name','store_name','restaurant_name','business_name','name_ar'],'متجر'));
const storeLogo = (r) => text(pick(r,['logo_url','logo','image_url','avatar_url','store_logo'],'') || '');
const storeCover = (r) => text(pick(r,['cover_url','cover_image_url','banner_url','header_image_url','cover'],'') || '');
const storePhone = (r) => text(pick(r,['phone','phone_number','contact_phone'],'') || '');
const storeAddress = (r) => text(pick(r,['address','address_text','location_name','area'],'') || '');
const storeSlug = (r) => text(pick(r,['slug','menu_slug','public_slug'],'') || '');
const categoryName = (r) => text(pick(r,['name','name_ar','title','category_name'],'قسم'));
const productName = (r) => text(pick(r,['name','name_ar','title','product_name'],'منتج'));
const productDescription = (r) => text(pick(r,['description','description_ar','details','product_description'],'') || '');
const productImage = (r) => text(pick(r,['image_url','image','photo_url','product_image_url','thumbnail_url'],'') || '');
const productPrice = (r) => pick(r,['price','selling_price','sale_price','unit_price','base_price'],null);
const productStoreId = (r) => text(pick(r,['store_id','restaurant_id','merchant_id','partner_id'],'') || '');
const categoryStoreId = (r) => text(pick(r,['store_id','restaurant_id','merchant_id','partner_id'],'') || '');
const productCategoryId = (r) => text(pick(r,['category_id','product_category_id','store_category_id'],'') || '');
const rowId = (r) => text(pick(r,['id','uuid','product_id','category_id'],'') || '');

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

function categoryActive(row) {
  return boolValue(pick(row,['is_active','active','enabled'],true),true);
}

function matchesStore(row, store) {
  const sid = rowId(store);
  const value = productStoreId(row) || categoryStoreId(row);
  if (!value) return true;
  return String(value) === String(sid);
}

function findStore(rows, wanted) {
  const lower = wanted.toLowerCase();
  return rows.find((r) => [rowId(r), storeSlug(r), storeName(r)].some((v) => text(v).toLowerCase() === lower)) ||
         rows.find((r) => storeSlug(r).toLowerCase() === lower) || null;
}

function isLocalHost(hostname = location.hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname).toLowerCase());
}

function publicBaseUrl() {
  const configured = text(APP_CONFIG?.publicMenuBaseUrl || '');
  if (configured) {
    try { return new URL(configured.endsWith('/') ? configured : `${configured}/`); } catch (_) {}
  }

  // After deployment this automatically becomes the real public website URL.
  // During local testing it intentionally stays on 127.0.0.1/localhost.
  return new URL('./', location.href);
}

function storeMenuUrl(store) {
  const base = publicBaseUrl();
  const url = new URL('menu.html', base);
  url.searchParams.set('store', storeSlug(store) || rowId(store));
  return url.href;
}

function publicLinkReady() {
  try { return !isLocalHost(new URL(storeMenuUrl({ id: 'preview' })).hostname); } catch (_) { return false; }
}


function qrImageUrl(url) {
  return `https://quickchart.io/qr?size=360&margin=2&ecLevel=M&text=${encodeURIComponent(url)}`;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    try {
      const input = document.createElement('textarea');
      input.value = value; input.style.position='fixed'; input.style.opacity='0';
      document.body.appendChild(input); input.select();
      const ok = document.execCommand('copy'); input.remove(); return ok;
    } catch (_) { return false; }
  }
}

function showQr(store) {
  const url = storeMenuUrl(store);
  qrStoreName.textContent = storeName(store);
  qrLink.value = url;
  qrImage.src = qrImageUrl(url);
  qrImage.dataset.menuUrl = url;
  qrModal.hidden = false;
  document.body.classList.add('qr-open');
}

function closeQr() {
  qrModal.hidden = true;
  document.body.classList.remove('qr-open');
}

function bindQrDialog() {
  document.querySelectorAll('[data-close-qr]').forEach((el) => el.addEventListener('click', closeQr));
  document.getElementById('qrCopyBtn')?.addEventListener('click', async (e) => {
    const ok = await copyText(qrLink.value);
    const btn=e.currentTarget; const old=btn.textContent; btn.textContent=ok?'تم النسخ':'تعذر النسخ'; setTimeout(()=>btn.textContent=old,1400);
  });
  document.getElementById('qrOpenBtn')?.addEventListener('click', () => window.open(qrImage.src,'_blank','noopener'));
  document.getElementById('qrPrintBtn')?.addEventListener('click', () => {
    const popup = window.open('', '_blank', 'width=520,height=700');
    if (!popup) return;
    const name = escapeHtml(qrStoreName.textContent);
    const img = escapeHtml(qrImage.src);
    const link = escapeHtml(qrLink.value);
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>QR ${name}</title><style>body{font-family:Arial;text-align:center;padding:30px}img{width:320px;height:320px}h1{margin:0 0 10px}.url{font-size:11px;direction:ltr;word-break:break-all;color:#555;margin-top:14px}@media print{button{display:none}}</style></head><body><h1>${name}</h1><p>المنيو الإلكتروني - هلا طلب</p><img src="${img}"><div class="url">${link}</div><p><button onclick="window.print()">طباعة</button></p></body></html>`);
    popup.document.close();
  });
}

bindQrDialog();

function renderState(title, message, actionHtml='') {
  content.innerHTML = `<section class="state-card"><div style="font-size:46px">🍽️</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${actionHtml}</section>`;
}

function renderStorePicker(stores) {
  document.title = 'اختر المطعم | هلا طلب';
  shareButton.hidden = true; copyButton.hidden = true; qrButton.hidden = true;
  const visible = stores.filter(storeVisible).sort((a,b) => storeName(a).localeCompare(storeName(b),'ar'));
  content.innerHTML = `
    <section class="store-picker-head">
      <h1>المنيو الإلكتروني</h1>
      <p>أي متجر جديد ومتاح يظهر هنا تلقائيًا من Supabase. لكل متجر رابط ثابت وQR خاص به. بعد رفع هذه النسخة على الاستضافة تصبح الروابط عامة تلقائيًا.</p>
    </section>
    ${!publicLinkReady() ? `<div class="local-link-notice">وضع الفحص المحلي: الروابط وQR تعمل على هذا الكمبيوتر فقط. بعد رفع Stage 43 على الاستضافة ستتحول تلقائيًا إلى روابط عامة.</div>` : ''}
    ${visible.length ? `<div class="stores-grid">${visible.map((store) => {
      const logo = storeLogo(store);
      const url = storeMenuUrl(store);
      return `<article class="store-card-wrap">
        <a class="store-card" href="${escapeHtml(url)}">
          ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(storeName(store))}" loading="lazy">` : `<span class="store-card-logo">${escapeHtml(storeName(store).slice(0,1) || 'هـ')}</span>`}
          <span class="store-card-text"><h3>${escapeHtml(storeName(store))}</h3><p>${escapeHtml(storeAddress(store) || storePhone(store) || 'عرض المنيو')}</p></span>
        </a>
        <div class="store-card-tools">
          <button type="button" class="mini-action" data-copy-store="${escapeHtml(url)}">نسخ الرابط</button>
          <button type="button" class="mini-action qr-action" data-qr-store="${escapeHtml(rowId(store))}">QR</button>
        </div>
      </article>`;
    }).join('')}</div>` : `<div class="empty-products">لا توجد متاجر متاحة للعرض حاليًا.</div>`}
  `;
  content.querySelectorAll('[data-copy-store]').forEach((btn) => btn.addEventListener('click', async () => {
    const ok=await copyText(btn.dataset.copyStore); const old=btn.textContent; btn.textContent=ok?'تم النسخ':'تعذر النسخ'; setTimeout(()=>btn.textContent=old,1400);
  }));
  content.querySelectorAll('[data-qr-store]').forEach((btn) => btn.addEventListener('click', () => {
    const store=visible.find((s)=>rowId(s)===btn.dataset.qrStore); if(store) showQr(store);
  }));
}

function renderHero(store) {
  const cover = storeCover(store);
  const logo = storeLogo(store);
  const phone = storePhone(store);
  const address = storeAddress(store);
  return `<section class="store-hero">
      ${cover ? `<img class="store-cover" src="${escapeHtml(cover)}" alt="" fetchpriority="high">` : `<div class="store-cover-fallback"></div>`}
      <div class="store-hero-inner">
        ${logo ? `<img class="store-logo" src="${escapeHtml(logo)}" alt="شعار ${escapeHtml(storeName(store))}">` : `<span class="store-logo store-logo-fallback">${escapeHtml(storeName(store).slice(0,1) || 'هـ')}</span>`}
        <div class="store-heading">
          <h1>${escapeHtml(storeName(store))}</h1>
          <p>${escapeHtml(address || 'أهلاً بك في المنيو الإلكتروني')}</p>
          <div class="store-meta">
            ${phone ? `<span>☎ ${escapeHtml(phone)}</span>` : ''}
            <span>منيو إلكتروني</span>
          </div>
        </div>
      </div>
    </section>`;
}

function renderMenu(store, categories, products) {
  document.title = `${storeName(store)} | المنيو الإلكتروني`;
  shareButton.hidden = false; copyButton.hidden = false; qrButton.hidden = false;
  const canonicalUrl = storeMenuUrl(store);
  copyButton.onclick = async () => { const ok=await copyText(canonicalUrl); const old=copyButton.textContent; copyButton.textContent=ok?'تم النسخ':'تعذر النسخ'; setTimeout(()=>copyButton.textContent=old,1400); };
  qrButton.onclick = () => showQr(store);
  shareButton.onclick = async () => {
    const payload = { title: storeName(store), text: `منيو ${storeName(store)}`, url: canonicalUrl };
    try {
      if (navigator.share) await navigator.share(payload);
      else { await copyText(canonicalUrl); shareButton.textContent='تم نسخ الرابط'; setTimeout(()=>shareButton.textContent='مشاركة',1600); }
    } catch (_) {}
  };

  const storeCategories = categories.filter((r) => matchesStore(r,store) && categoryActive(r));
  const storeProducts = products.filter((r) => matchesStore(r,store));
  const categoriesById = new Map(storeCategories.map((r) => [rowId(r),r]));
  const orphanProducts = storeProducts.filter((p) => !productCategoryId(p) || !categoriesById.has(productCategoryId(p)));

  const groups = storeCategories
    .sort((a,b) => Number(pick(a,['sort_order','display_order','order'],999)) - Number(pick(b,['sort_order','display_order','order'],999)))
    .map((category) => ({ category, products: storeProducts.filter((p) => productCategoryId(p) === rowId(category)) }))
    .filter((group) => group.products.length);
  if (orphanProducts.length) groups.unshift({ category:{ id:'__all__', name:'الأصناف' }, products:orphanProducts });

  const total = storeProducts.length;
  const tabs = groups.map((g) => `<button class="category-tab" type="button" data-target="cat-${escapeHtml(rowId(g.category) || '__all__')}">${escapeHtml(categoryName(g.category))}</button>`).join('');

  content.innerHTML = `${renderHero(store)}
    <section class="menu-tools">
      <div class="search-wrap"><span class="search-icon">⌕</span><input id="menuSearch" type="search" placeholder="ابحث داخل المنيو..." autocomplete="off"></div>
      ${tabs ? `<div class="category-tabs"><button class="category-tab active" type="button" data-target="top">الكل</button>${tabs}</div>` : ''}
    </section>
    <div class="menu-summary" id="top"><h2>المنيو</h2><span id="menuCount">${total} صنف</span></div>
    <div id="menuGroups">${groups.length ? groups.map(renderGroup).join('') : `<div class="empty-products">لا توجد منتجات معروضة لهذا المطعم حاليًا.</div>`}</div>`;

  document.querySelectorAll('.category-tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.category-tab').forEach((x) => x.classList.remove('active'));
    button.classList.add('active');
    const target = button.dataset.target;
    if (target === 'top') window.scrollTo({top:0,behavior:'smooth'});
    else document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));

  const search = document.getElementById('menuSearch');
  search?.addEventListener('input', () => filterProducts(search.value));
}

function renderGroup(group) {
  const id = rowId(group.category) || '__all__';
  return `<section class="category-section" id="cat-${escapeHtml(id)}" data-category-section>
      <div class="section-title"><h2>${escapeHtml(categoryName(group.category))}</h2><span>${group.products.length}</span></div>
      <div class="products-grid">${group.products.map(renderProduct).join('')}</div>
    </section>`;
}

function renderProduct(product) {
  const image = productImage(product);
  const available = productAvailable(product);
  const name = productName(product);
  return `<article class="product-card" data-product-card data-search="${escapeHtml(`${name} ${productDescription(product)}`.toLowerCase())}">
      <div class="product-media ${image ? '' : 'no-image'}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy">` : '🍽️'}
        ${available ? '' : `<span class="availability-badge off">غير متوفر</span>`}
      </div>
      <div class="product-body">
        <div class="product-head"><h3>${escapeHtml(name)}</h3><strong class="product-price">${money(productPrice(product))}</strong></div>
        ${productDescription(product) ? `<p class="product-desc">${escapeHtml(productDescription(product))}</p>` : ''}
      </div>
    </article>`;
}

function filterProducts(query) {
  const q = text(query).toLowerCase();
  let visible = 0;
  document.querySelectorAll('[data-product-card]').forEach((card) => {
    const show = !q || (card.dataset.search || '').includes(q);
    card.hidden = !show;
    if (show) visible++;
  });
  document.querySelectorAll('[data-category-section]').forEach((section) => {
    section.hidden = !section.querySelector('[data-product-card]:not([hidden])');
  });
  const count = document.getElementById('menuCount');
  if (count) count.textContent = `${visible} صنف`;
}

let realtimeChannel = null;
let reloadTimer = null;

async function loadPublicMenu() {
  if (!isSupabaseConfigured() || !supabase) {
    renderState('الربط غير مكتمل','لم يتم إعداد اتصال Supabase في هذه النسخة بعد.');
    return null;
  }

  const storesResult = await firstReadableTable(TABLES.stores,{limit:5000});
  if (!storesResult.ok) {
    renderState('تعذر تحميل المتاجر','تأكد من اتصال الإنترنت وسياسات القراءة العامة في Supabase.');
    console.warn(storesResult.errors);
    return null;
  }

  if (!requestedStore) {
    renderStorePicker(storesResult.rows);
    return { storesTable: storesResult.table, categoryTable:null, productTable:null };
  }

  const store = findStore(storesResult.rows,requestedStore);
  if (!store) {
    renderState('المطعم غير موجود','الرابط غير صحيح أو أن المطعم لم يعد متاحًا.',`<p style="margin-top:16px"><a class="primary-btn" href="./menu.html" style="display:inline-block;text-decoration:none">عرض المطاعم</a></p>`);
    return null;
  }

  const [categoryResult, productResult] = await Promise.all([
    firstReadableTable(TABLES.categories,{limit:5000}),
    firstReadableTable(TABLES.products,{limit:10000}),
  ]);

  if (!productResult.ok) {
    renderState('تعذر قراءة المنتجات','صفحة المنيو مرتبطة بـ Supabase، لكن جدول المنتجات غير متاح للقراءة العامة حاليًا. إذا ظهر هذا التنبيه نحدد اسم الجدول الفعلي أو سياسة RLS فقط، بدون تغيير بقية النظام.');
    console.warn('Product table candidates failed:',productResult.errors);
    return { storesTable:storesResult.table, categoryTable:categoryResult.table, productTable:null };
  }

  renderMenu(store, categoryResult.rows || [], productResult.rows || []);
  return { storesTable:storesResult.table, categoryTable:categoryResult.table, productTable:productResult.table };
}

function scheduleRealtimeReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => loadPublicMenu().catch(console.error), 450);
}

function enableRealtime(tables) {
  if (!requestedStore || !tables || !supabase) return;
  const uniqueTables = [...new Set([tables.storesTable,tables.categoryTable,tables.productTable].filter(Boolean))];
  if (!uniqueTables.length) return;
  try {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    let channel = supabase.channel(`public-menu-${requestedStore}-${Date.now()}`);
    uniqueTables.forEach((table) => {
      channel = channel.on('postgres_changes',{event:'*',schema:'public',table},scheduleRealtimeReload);
    });
    realtimeChannel = channel.subscribe();
  } catch (error) {
    console.warn('Realtime menu subscription unavailable:', error);
  }
}

async function init() {
  const tables = await loadPublicMenu();
  enableRealtime(tables);
}

init().catch((error) => {
  console.error(error);
  renderState('حدث خطأ غير متوقع','أعد تحميل الصفحة. إذا استمرت المشكلة، راجع اتصال Supabase.');
});
