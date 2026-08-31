-- Hala Talab Admin Stage 13 — True Category Position
-- يجعل sort_order هو موقع الظهور الحقيقي: 1 = الأول، 2 = الثاني ...
-- آمن لإعادة التشغيل، ويحافظ على UUID لكل تصنيف وربط المتاجر به.

-- 1) ترتيب التصنيفات الثمانية الأصلية من 1 إلى 8.
update public.system_categories set sort_order = case category_key
  when 'restaurants' then 1
  when 'grocery' then 2
  when 'desserts' then 3
  when 'pharmacies' then 4
  when 'cafes' then 5
  when 'hookah' then 6
  when 'beverages' then 7
  when 'flowers' then 8
  else sort_order
end,
updated_at = now()
where category_key in ('restaurants','grocery','desserts','pharmacies','cafes','hookah','beverages','flowers');

-- 2) أي تصنيفات مضافة من الإدارة تبدأ من 9 وتحافظ على ترتيبها النسبي الحالي.
with custom as (
  select id,
         8 + row_number() over (order by coalesce(sort_order, 999999), created_at, id)::integer as new_order
  from public.system_categories
  where category_key is null
     or category_key not in ('restaurants','grocery','desserts','pharmacies','cafes','hookah','beverages','flowers')
)
update public.system_categories c
set sort_order = custom.new_order,
    updated_at = now()
from custom
where c.id = custom.id;

-- 3) إنشاء تصنيف في موقع محدد: يزيح ما بعده تلقائيًا.
create or replace function public.admin_create_system_category(
  p_name_ar text,
  p_name_ku text default null,
  p_name_en text default null,
  p_icon text default null,
  p_image_url text default null,
  p_color_hex text default '#FF7A00',
  p_sort_order integer default 1,
  p_is_active boolean default true
) returns public.system_categories
language plpgsql security definer set search_path=public
as $$
declare
  r public.system_categories;
  target_order integer;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  if nullif(trim(p_name_ar),'') is null then raise exception 'category name is required'; end if;

  target_order := greatest(1, least(coalesce(p_sort_order,1), (select count(*)::integer + 1 from public.system_categories)));

  update public.system_categories
  set sort_order = sort_order + 1,
      updated_at = now()
  where sort_order >= target_order;

  insert into public.system_categories(name_ar,name_ku,name_en,icon,image_url,color_hex,sort_order,is_active)
  values(
    trim(p_name_ar), nullif(trim(p_name_ku),''), nullif(trim(p_name_en),''),
    nullif(trim(p_icon),''), nullif(trim(p_image_url),''),
    coalesce(nullif(trim(p_color_hex),''),'#FF7A00'), target_order, coalesce(p_is_active,true)
  ) returning * into r;
  return r;
end $$;

-- 4) تعديل الموقع: إذا نقلت ورود من 8 إلى 2، ورود تصبح الثانية والبقية تتحرك تلقائيًا.
create or replace function public.admin_update_system_category(
  p_id uuid,
  p_name_ar text,
  p_name_ku text default null,
  p_name_en text default null,
  p_icon text default null,
  p_image_url text default null,
  p_color_hex text default '#FF7A00',
  p_sort_order integer default 1,
  p_is_active boolean default true
) returns public.system_categories
language plpgsql security definer set search_path=public
as $$
declare
  r public.system_categories;
  old_order integer;
  target_order integer;
  total_count integer;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  if nullif(trim(p_name_ar),'') is null then raise exception 'category name is required'; end if;

  select sort_order into old_order from public.system_categories where id=p_id for update;
  if old_order is null then raise exception 'category not found'; end if;
  select count(*)::integer into total_count from public.system_categories;
  target_order := greatest(1, least(coalesce(p_sort_order,old_order), greatest(total_count,1)));

  if target_order < old_order then
    update public.system_categories
    set sort_order = sort_order + 1, updated_at=now()
    where id <> p_id and sort_order >= target_order and sort_order < old_order;
  elsif target_order > old_order then
    update public.system_categories
    set sort_order = sort_order - 1, updated_at=now()
    where id <> p_id and sort_order > old_order and sort_order <= target_order;
  end if;

  update public.system_categories
  set name_ar=trim(p_name_ar),
      name_ku=nullif(trim(p_name_ku),''),
      name_en=nullif(trim(p_name_en),''),
      icon=nullif(trim(p_icon),''),
      image_url=nullif(trim(p_image_url),''),
      color_hex=coalesce(nullif(trim(p_color_hex),''),'#FF7A00'),
      sort_order=target_order,
      is_active=coalesce(p_is_active,true),
      updated_at=now()
  where id=p_id
  returning * into r;

  return r;
end $$;

-- 5) الحذف يغلق الفجوة في الترتيب.
create or replace function public.admin_delete_system_category(p_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare
  old_order integer;
  affected integer;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  select sort_order into old_order from public.system_categories where id=p_id;
  delete from public.system_categories where id=p_id;
  get diagnostics affected = row_count;
  if affected > 0 and old_order is not null then
    update public.system_categories
    set sort_order = sort_order - 1, updated_at=now()
    where sort_order > old_order;
  end if;
  return affected > 0;
end $$;

revoke all on function public.admin_create_system_category(text,text,text,text,text,text,integer,boolean) from public;
revoke all on function public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean) from public;
revoke all on function public.admin_delete_system_category(uuid) from public;
grant execute on function public.admin_create_system_category(text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.admin_delete_system_category(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'category_true_order_ready' as check_name,
       count(*) as total_categories,
       min(sort_order) as first_position,
       max(sort_order) as last_position
from public.system_categories;
