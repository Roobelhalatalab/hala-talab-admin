-- Hala Talab Admin Stage 10 — Client Home Categories
-- تصنيفات واجهة العميل العامة: مطاعم، بقالة، حلويات ...

create extension if not exists pgcrypto;

create table if not exists public.system_categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_ku text,
  name_en text,
  icon text,
  image_url text,
  color_hex text not null default '#FF7A00',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- توافق مع نسخة أقدم من الجدول إن كانت موجودة مسبقًا.
alter table public.system_categories add column if not exists name_ar text;
alter table public.system_categories add column if not exists name_ku text;
alter table public.system_categories add column if not exists name_en text;
alter table public.system_categories add column if not exists icon text;
alter table public.system_categories add column if not exists image_url text;
alter table public.system_categories add column if not exists color_hex text default '#FF7A00';
alter table public.system_categories add column if not exists sort_order integer default 0;
alter table public.system_categories add column if not exists is_active boolean default true;
alter table public.system_categories add column if not exists updated_at timestamptz default now();

alter table public.system_categories enable row level security;
drop policy if exists system_categories_public_read on public.system_categories;
create policy system_categories_public_read on public.system_categories
  for select to anon, authenticated
  using (coalesce(is_active,true)=true or public.is_hala_admin());

grant select on public.system_categories to anon, authenticated;

create or replace function public.admin_create_system_category(
  p_name_ar text,
  p_name_ku text default null,
  p_name_en text default null,
  p_icon text default null,
  p_image_url text default null,
  p_color_hex text default '#FF7A00',
  p_sort_order integer default 0,
  p_is_active boolean default true
) returns public.system_categories
language plpgsql security definer set search_path=public
as $$
declare r public.system_categories;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  if nullif(trim(p_name_ar),'') is null then raise exception 'category name is required'; end if;
  insert into public.system_categories(name_ar,name_ku,name_en,icon,image_url,color_hex,sort_order,is_active)
  values(trim(p_name_ar),nullif(trim(p_name_ku),''),nullif(trim(p_name_en),''),nullif(trim(p_icon),''),nullif(trim(p_image_url),''),coalesce(nullif(trim(p_color_hex),''),'#FF7A00'),coalesce(p_sort_order,0),coalesce(p_is_active,true)) returning * into r;
  return r;
end $$;

create or replace function public.admin_update_system_category(
  p_id uuid,
  p_name_ar text,
  p_name_ku text default null,
  p_name_en text default null,
  p_icon text default null,
  p_image_url text default null,
  p_color_hex text default '#FF7A00',
  p_sort_order integer default 0,
  p_is_active boolean default true
) returns public.system_categories
language plpgsql security definer set search_path=public
as $$
declare r public.system_categories;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  update public.system_categories set name_ar=trim(p_name_ar),name_ku=nullif(trim(p_name_ku),''),name_en=nullif(trim(p_name_en),''),icon=nullif(trim(p_icon),''),image_url=nullif(trim(p_image_url),''),color_hex=coalesce(nullif(trim(p_color_hex),''),'#FF7A00'),sort_order=coalesce(p_sort_order,0),is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id returning * into r;
  if r.id is null then raise exception 'category not found'; end if;
  return r;
end $$;

create or replace function public.admin_set_system_category_active(p_id uuid,p_is_active boolean)
returns public.system_categories language plpgsql security definer set search_path=public
as $$ declare r public.system_categories; begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  update public.system_categories set is_active=p_is_active,updated_at=now() where id=p_id returning * into r;
  return r;
end $$;

create or replace function public.admin_delete_system_category(p_id uuid)
returns boolean language plpgsql security definer set search_path=public
as $$ begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  delete from public.system_categories where id=p_id;
  return found;
end $$;

revoke all on function public.admin_create_system_category(text,text,text,text,text,text,integer,boolean) from public;
revoke all on function public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean) from public;
revoke all on function public.admin_set_system_category_active(uuid,boolean) from public;
revoke all on function public.admin_delete_system_category(uuid) from public;
grant execute on function public.admin_create_system_category(text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.admin_update_system_category(uuid,text,text,text,text,text,text,integer,boolean) to authenticated;
grant execute on function public.admin_set_system_category_active(uuid,boolean) to authenticated;
grant execute on function public.admin_delete_system_category(uuid) to authenticated;

select 'client_categories_ready' as check_name, to_regclass('public.system_categories') is not null as ok;
