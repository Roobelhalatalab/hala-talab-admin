-- Hala Talab Admin Stage 21
-- 1) Persist category image URL immediately and enable realtime refresh for Client.
-- 2) Return customer name/phone from auth user metadata when partner_profiles has no row.
-- Safe to run once (or re-run: CREATE OR REPLACE / guarded publication add).

create or replace function public.admin_update_system_category_image_v1(
  p_id uuid,
  p_image_url text
) returns public.system_categories
language plpgsql
security definer
set search_path=public
as $$
declare r public.system_categories;
begin
  if not public.is_hala_admin() then raise exception 'admin only'; end if;
  if p_id is null then raise exception 'category id is required'; end if;
  if nullif(trim(p_image_url),'') is null then raise exception 'image url is required'; end if;

  update public.system_categories
  set image_url=trim(p_image_url), updated_at=now()
  where id=p_id
  returning * into r;

  if r.id is null then raise exception 'category not found'; end if;
  return r;
end $$;

revoke all on function public.admin_update_system_category_image_v1(uuid,text) from public;
grant execute on function public.admin_update_system_category_image_v1(uuid,text) to authenticated;

-- Ensure system_categories changes can reach the Client realtime subscription.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='system_categories'
     ) then
    execute 'alter publication supabase_realtime add table public.system_categories';
  end if;
exception when others then
  raise notice 'Realtime publication update skipped: %', sqlerrm;
end $$;

-- Stage 21 FIX2: resolve customer name/phone from every server-side source available.
-- Old customer builds stored profile values locally on-device, so Auth metadata may be empty.
-- We therefore fall back to the customer's latest order, where checkout already stores
-- customer_name/customer_phone. This preserves all users and deletes no customer data.
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  phone text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  profile_full_name text,
  profile_phone text,
  metadata_full_name text,
  metadata_phone text,
  partner_type text,
  is_admin boolean,
  admin_active boolean,
  access_status text,
  admin_notes text,
  effective_type text,
  store_count bigint,
  driver_order_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_hala_admin() then raise exception 'Admin access required'; end if;

  return query
  select
    u.id,
    u.email::text,
    u.phone::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    coalesce(
      nullif(trim(p.full_name),''),
      nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'display_name','')),''),
      nullif(trim(lo.customer_name),'')
    )::text as profile_full_name,
    coalesce(
      nullif(trim(p.phone),''),
      nullif(trim(coalesce(u.raw_user_meta_data->>'contact_phone',u.raw_user_meta_data->>'phone',u.raw_user_meta_data->>'mobile','')),''),
      nullif(trim(u.phone::text),''),
      nullif(trim(lo.customer_phone),'')
    )::text as profile_phone,
    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'display_name',lo.customer_name,'')),'')::text,
    nullif(trim(coalesce(u.raw_user_meta_data->>'contact_phone',u.raw_user_meta_data->>'phone',u.raw_user_meta_data->>'mobile',u.phone::text,lo.customer_phone,'')),'')::text,
    p.partner_type::text,
    (au.id is not null and au.role='admin' and coalesce(au.is_active,true)) as is_admin,
    au.is_active,
    coalesce(c.access_status,'active')::text,
    coalesce(c.notes,'')::text,
    case
      when au.id is not null and au.role='admin' and coalesce(au.is_active,true) then 'admin'
      when exists(select 1 from public.stores s where s.owner_id=u.id) then 'store_owner'
      when exists(select 1 from public.orders o where o.driver_id=u.id) then 'driver'
      when lower(coalesce(p.partner_type,'')) in ('driver','courier') then 'driver'
      when lower(coalesce(p.partner_type,'')) in ('store','merchant','restaurant','owner','store_owner') then 'store_owner'
      else 'customer'
    end::text,
    (select count(*) from public.stores s where s.owner_id=u.id)::bigint,
    (select count(*) from public.orders o where o.driver_id=u.id)::bigint
  from auth.users u
  left join public.partner_profiles p on p.id=u.id
  left join public.admin_users au on au.id=u.id
  left join public.admin_user_controls c on c.user_id=u.id
  left join lateral (
    select o.customer_name::text, o.customer_phone::text
    from public.orders o
    where o.customer_id=u.id
      and (nullif(trim(o.customer_name),'') is not null or nullif(trim(o.customer_phone),'') is not null)
    order by coalesce(o.updated_at,o.created_at) desc nulls last, o.created_at desc nulls last
    limit 1
  ) lo on true
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

select 'admin_stage21_ready' as check_name,
       to_regprocedure('public.admin_update_system_category_image_v1(uuid,text)') is not null as category_image_rpc,
       to_regprocedure('public.admin_list_users()') is not null as users_rpc;
