-- Hala Talab Admin Stage 8 — Categories Fix
-- يربط لوحة الإدارة بجدول product_categories الحقيقي ويضيف RPC آمنة للإدارة فقط.

-- تأكد من وجود helper من Stage 8.
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

-- اسم عمود مناسب من مجموعة أسماء شائعة.
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

-- منح المدير قراءة الجدول الحقيقي بدون تغيير سياسات المستخدمين العاديين.
do $$
begin
  if to_regclass('public.product_categories') is not null then
    drop policy if exists admin_stage8_categories_read on public.product_categories;
    create policy admin_stage8_categories_read on public.product_categories
      for select to authenticated using (public.is_hala_admin());
  end if;
end $$;

-- إضافة قسم مع اكتشاف أسماء الأعمدة الموجودة فعليًا.
create or replace function public.admin_create_product_category(
  p_name text,
  p_store_id uuid default null,
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
  name_col := public._admin_pc_column(array['name','title','name_ar','category_name']);
  store_col := public._admin_pc_column(array['store_id']);
  active_col := public._admin_pc_column(array['is_active','active','enabled']);
  order_col := public._admin_pc_column(array['sort_order','position','order_index','display_order']);
  if name_col is null then raise exception 'No supported category name column found'; end if;
  cols := array_append(cols,format('%I',name_col)); vals := array_append(vals,format('%L',p_name));
  if store_col is not null and p_store_id is not null then cols:=array_append(cols,format('%I',store_col)); vals:=array_append(vals,format('%L::uuid',p_store_id)); end if;
  if active_col is not null then cols:=array_append(cols,format('%I',active_col)); vals:=array_append(vals,case when p_is_active then 'true' else 'false' end); end if;
  if order_col is not null then cols:=array_append(cols,format('%I',order_col)); vals:=array_append(vals,p_sort_order::text); end if;
  sql_text := format('insert into public.product_categories (%s) values (%s) returning to_jsonb(product_categories.*)',array_to_string(cols,','),array_to_string(vals,','));
  execute sql_text into new_row;
  insert into public.admin_audit_log(admin_id,action,entity_type,entity_id,details)
  values(auth.uid(),'create_category','product_category',coalesce(new_row->>'id',''),jsonb_build_object('name',p_name));
  return new_row;
end $$;
revoke all on function public.admin_create_product_category(text,uuid,integer,boolean) from public;
grant execute on function public.admin_create_product_category(text,uuid,integer,boolean) to authenticated;

create or replace function public.admin_update_product_category(
  p_id text,
  p_name text default null,
  p_store_id uuid default null,
  p_sort_order integer default null,
  p_is_active boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  id_col text; name_col text; store_col text; active_col text; order_col text;
  sets text[] := array[]::text[]; sql_text text; updated jsonb;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  id_col := public._admin_pc_column(array['id']);
  if id_col is null then raise exception 'No id column found'; end if;
  name_col := public._admin_pc_column(array['name','title','name_ar','category_name']);
  store_col := public._admin_pc_column(array['store_id']);
  active_col := public._admin_pc_column(array['is_active','active','enabled']);
  order_col := public._admin_pc_column(array['sort_order','position','order_index','display_order']);
  if p_name is not null and name_col is not null then sets:=array_append(sets,format('%I=%L',name_col,p_name)); end if;
  if p_store_id is not null and store_col is not null then sets:=array_append(sets,format('%I=%L::uuid',store_col,p_store_id)); end if;
  if p_sort_order is not null and order_col is not null then sets:=array_append(sets,format('%I=%s',order_col,p_sort_order)); end if;
  if p_is_active is not null and active_col is not null then sets:=array_append(sets,format('%I=%s',active_col,case when p_is_active then 'true' else 'false' end)); end if;
  if array_length(sets,1) is null then raise exception 'Nothing to update'; end if;
  sql_text:=format('update public.product_categories set %s where %I::text=%L returning to_jsonb(product_categories.*)',array_to_string(sets,','),id_col,p_id);
  execute sql_text into updated;
  insert into public.admin_audit_log(admin_id,action,entity_type,entity_id,details) values(auth.uid(),'update_category','product_category',p_id,'{}'::jsonb);
  return updated;
end $$;
revoke all on function public.admin_update_product_category(text,text,uuid,integer,boolean) from public;
grant execute on function public.admin_update_product_category(text,text,uuid,integer,boolean) to authenticated;

create or replace function public.admin_delete_product_category(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare id_col text; affected integer;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  id_col:=public._admin_pc_column(array['id']);
  if id_col is null then raise exception 'No id column found'; end if;
  execute format('delete from public.product_categories where %I::text=%L',id_col,p_id);
  get diagnostics affected = row_count;
  if affected>0 then insert into public.admin_audit_log(admin_id,action,entity_type,entity_id,details) values(auth.uid(),'delete_category','product_category',p_id,'{}'::jsonb); end if;
  return affected>0;
end $$;
revoke all on function public.admin_delete_product_category(text) from public;
grant execute on function public.admin_delete_product_category(text) to authenticated;
