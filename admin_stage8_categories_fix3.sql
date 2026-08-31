-- Hala Talab Admin Stage 8 — Categories Fix 3
-- يجعل store_id إلزاميًا عند إنشاء الأقسام ويضمن أن المدير يستطيع قراءة stores.

create or replace function public.is_hala_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.role = 'admin' and coalesce(a.is_active,true) = true
  );
$$;
revoke all on function public.is_hala_admin() from public;
grant execute on function public.is_hala_admin() to authenticated;

-- ضمان قراءة المتاجر لحساب Admin فقط، بدون فتح الجدول لباقي المستخدمين.
do $$
begin
  if to_regclass('public.stores') is not null then
    alter table public.stores enable row level security;
    drop policy if exists admin_stage8_stores_read on public.stores;
    create policy admin_stage8_stores_read on public.stores
      for select to authenticated
      using (public.is_hala_admin());
  end if;
end $$;

-- احتفظ بدالة اكتشاف الأعمدة من النسخة السابقة.
create or replace function public._admin_pc_column(candidates text[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select c.column_name
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name='product_categories'
    and c.column_name = any(candidates)
  order by array_position(candidates,c.column_name)
  limit 1;
$$;
revoke all on function public._admin_pc_column(text[]) from public;

-- قراءة product_categories للمدير.
do $$
begin
  if to_regclass('public.product_categories') is not null then
    alter table public.product_categories enable row level security;
    drop policy if exists admin_stage8_categories_read on public.product_categories;
    create policy admin_stage8_categories_read on public.product_categories
      for select to authenticated
      using (public.is_hala_admin());
  end if;
end $$;

-- إنشاء قسم: المتجر إجباري لأن product_categories.store_id عندك NOT NULL.
create or replace function public.admin_create_product_category(
  p_name text,
  p_store_id uuid,
  p_sort_order integer default 0,
  p_is_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  name_col text; store_col text; active_col text; order_col text;
  cols text[] := array[]::text[]; vals text[] := array[]::text[];
  sql_text text; new_row jsonb;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  if to_regclass('public.product_categories') is null then raise exception 'product_categories does not exist'; end if;
  if p_store_id is null then raise exception 'store is required'; end if;
  if not exists(select 1 from public.stores where id=p_store_id) then raise exception 'selected store does not exist'; end if;

  name_col := public._admin_pc_column(array['name','title','name_ar','category_name']);
  store_col := public._admin_pc_column(array['store_id']);
  active_col := public._admin_pc_column(array['is_active','active','enabled']);
  order_col := public._admin_pc_column(array['sort_order','position','order_index','display_order']);
  if name_col is null then raise exception 'No supported category name column found'; end if;
  if store_col is null then raise exception 'store_id column not found'; end if;

  cols := array_append(cols,format('%I',name_col)); vals := array_append(vals,format('%L',p_name));
  cols := array_append(cols,format('%I',store_col)); vals := array_append(vals,format('%L::uuid',p_store_id));
  if active_col is not null then cols:=array_append(cols,format('%I',active_col)); vals:=array_append(vals,case when p_is_active then 'true' else 'false' end); end if;
  if order_col is not null then cols:=array_append(cols,format('%I',order_col)); vals:=array_append(vals,p_sort_order::text); end if;

  sql_text := format('insert into public.product_categories (%s) values (%s) returning to_jsonb(product_categories.*)',array_to_string(cols,','),array_to_string(vals,','));
  execute sql_text into new_row;

  if to_regclass('public.admin_audit_log') is not null then
    insert into public.admin_audit_log(admin_id,action,entity_type,entity_id,details)
    values(auth.uid(),'create_category','product_category',coalesce(new_row->>'id',''),jsonb_build_object('name',p_name,'store_id',p_store_id));
  end if;
  return new_row;
end $$;
revoke all on function public.admin_create_product_category(text,uuid,integer,boolean) from public;
grant execute on function public.admin_create_product_category(text,uuid,integer,boolean) to authenticated;
