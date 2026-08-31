-- Hala Talab Admin Stage 6
-- Secure user listing from auth.users + basic admin-dashboard permissions.
-- Run once in Supabase SQL Editor.

create or replace function public.is_hala_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.id = auth.uid() and au.role = 'admin' and coalesce(au.is_active,true)=true
  );
$$;
grant execute on function public.is_hala_admin() to authenticated;

create table if not exists public.admin_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_status text not null default 'active' check (access_status in ('active','monitor','suspended')),
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.admin_user_controls enable row level security;

drop policy if exists "hala admin read user controls" on public.admin_user_controls;
create policy "hala admin read user controls" on public.admin_user_controls for select to authenticated using (public.is_hala_admin());
drop policy if exists "hala admin insert user controls" on public.admin_user_controls;
create policy "hala admin insert user controls" on public.admin_user_controls for insert to authenticated with check (public.is_hala_admin());
drop policy if exists "hala admin update user controls" on public.admin_user_controls;
create policy "hala admin update user controls" on public.admin_user_controls for update to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin());

-- Allow admins to manage admin dashboard membership. The helper function prevents RLS recursion.
drop policy if exists "hala admin read admin users stage6" on public.admin_users;
create policy "hala admin read admin users stage6" on public.admin_users for select to authenticated using (public.is_hala_admin() or id=auth.uid());
drop policy if exists "hala admin insert admin users stage6" on public.admin_users;
create policy "hala admin insert admin users stage6" on public.admin_users for insert to authenticated with check (public.is_hala_admin());
drop policy if exists "hala admin update admin users stage6" on public.admin_users;
create policy "hala admin update admin users stage6" on public.admin_users for update to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin());
drop policy if exists "hala admin delete admin users stage6" on public.admin_users;
create policy "hala admin delete admin users stage6" on public.admin_users for delete to authenticated using (public.is_hala_admin() and id <> auth.uid());

-- Read all Auth users without exposing service_role in the browser.
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
  if not public.is_hala_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.phone::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    p.full_name::text,
    p.phone::text,
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
    end::text as effective_type,
    (select count(*) from public.stores s where s.owner_id=u.id)::bigint,
    (select count(*) from public.orders o where o.driver_id=u.id)::bigint
  from auth.users u
  left join public.partner_profiles p on p.id=u.id
  left join public.admin_users au on au.id=u.id
  left join public.admin_user_controls c on c.user_id=u.id
  order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

-- One controlled RPC for saving both dashboard permission and internal admin follow-up state.
create or replace function public.admin_update_user_access(
  p_user_id uuid,
  p_make_admin boolean,
  p_access_status text,
  p_notes text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_hala_admin() then raise exception 'Admin access required'; end if;
  if p_access_status not in ('active','monitor','suspended') then raise exception 'Invalid access status'; end if;
  if p_user_id = auth.uid() and p_make_admin = false then raise exception 'You cannot remove your own admin access'; end if;

  insert into public.admin_user_controls(user_id,access_status,notes,updated_by,updated_at)
  values(p_user_id,p_access_status,coalesce(p_notes,''),auth.uid(),now())
  on conflict(user_id) do update set access_status=excluded.access_status,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now();

  if p_make_admin then
    insert into public.admin_users(id,role,is_active)
    values(p_user_id,'admin',true)
    on conflict(id) do update set role='admin',is_active=true;
  else
    delete from public.admin_users where id=p_user_id and id<>auth.uid();
  end if;
  return true;
end;
$$;
revoke all on function public.admin_update_user_access(uuid,boolean,text,text) from public;
grant execute on function public.admin_update_user_access(uuid,boolean,text,text) to authenticated;
