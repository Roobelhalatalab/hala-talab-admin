-- Hala Talab Admin — Final Review Actions
-- Run once in Supabase SQL Editor before testing the new permanent/archival actions.

create or replace function public.is_hala_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = (
    select au.id
    from public.admin_users au
    where au.role='admin' and coalesce(au.is_active,true)=true
    order by coalesce(au.created_at, now()) asc, au.id asc
    limit 1
  );
$$;
grant execute on function public.is_hala_primary_admin() to authenticated;

-- Expand account-control states to support permanent driver blocking.
alter table public.admin_user_controls
  drop constraint if exists admin_user_controls_access_status_check;

alter table public.admin_user_controls
  add constraint admin_user_controls_access_status_check
  check (access_status in ('active','monitor','suspended','blocked'));

create or replace function public.admin_set_driver_access(
  p_driver_id uuid,
  p_status text,
  p_reason text default ''
)
returns public.admin_user_controls
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r public.admin_user_controls;
begin
  if not public.is_hala_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('active','suspended','blocked') then raise exception 'Invalid driver status'; end if;
  if p_status='blocked' and length(trim(coalesce(p_reason,'')))=0 then
    raise exception 'A reason is required for permanent suspension';
  end if;

  -- Only the primary admin can reopen a permanently blocked driver.
  if p_status='active'
     and exists(select 1 from public.admin_user_controls c where c.user_id=p_driver_id and c.access_status='blocked')
     and not public.is_hala_primary_admin() then
    raise exception 'Only the primary admin can reactivate a permanently blocked driver';
  end if;

  insert into public.admin_user_controls(user_id,access_status,notes,updated_by,updated_at)
  values(p_driver_id,p_status,coalesce(p_reason,''),auth.uid(),now())
  on conflict(user_id) do update
    set access_status=excluded.access_status,
        notes=excluded.notes,
        updated_by=excluded.updated_by,
        updated_at=now()
  returning * into r;

  return r;
end;
$$;
revoke all on function public.admin_set_driver_access(uuid,text,text) from public;
grant execute on function public.admin_set_driver_access(uuid,text,text) to authenticated;

-- Separate store lifecycle from review decision.
create table if not exists public.admin_store_controls (
  store_id uuid primary key references public.stores(id) on delete cascade,
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active','paused','archived')),
  reason text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_store_controls enable row level security;

drop policy if exists "hala admin read store controls" on public.admin_store_controls;
create policy "hala admin read store controls"
on public.admin_store_controls for select to authenticated
using (public.is_hala_admin());

drop policy if exists "hala admin insert store controls" on public.admin_store_controls;
create policy "hala admin insert store controls"
on public.admin_store_controls for insert to authenticated
with check (public.is_hala_admin());

drop policy if exists "hala admin update store controls" on public.admin_store_controls;
create policy "hala admin update store controls"
on public.admin_store_controls for update to authenticated
using (public.is_hala_admin()) with check (public.is_hala_admin());

create or replace function public.admin_set_store_lifecycle(
  p_store_id uuid,
  p_status text,
  p_reason text default ''
)
returns public.admin_store_controls
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r public.admin_store_controls;
begin
  if not public.is_hala_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('active','paused','archived') then raise exception 'Invalid store status'; end if;
  if p_status='archived' and length(trim(coalesce(p_reason,'')))=0 then
    raise exception 'A reason is required for store archival';
  end if;

  insert into public.admin_store_controls(store_id,lifecycle_status,reason,updated_by,updated_at)
  values(p_store_id,p_status,coalesce(p_reason,''),auth.uid(),now())
  on conflict(store_id) do update
    set lifecycle_status=excluded.lifecycle_status,
        reason=excluded.reason,
        updated_by=excluded.updated_by,
        updated_at=now()
  returning * into r;

  -- Mirror to common operational fields when they exist.
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stores' and column_name='is_active') then
    execute 'update public.stores set is_active=$1 where id=$2' using (p_status='active'), p_store_id;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='stores' and column_name='is_open') then
    if p_status in ('paused','archived') then
      execute 'update public.stores set is_open=false where id=$1' using p_store_id;
    end if;
  end if;

  return r;
end;
$$;
revoke all on function public.admin_set_store_lifecycle(uuid,text,text) from public;
grant execute on function public.admin_set_store_lifecycle(uuid,text,text) to authenticated;

-- Hard delete is deliberately restricted and refuses stores with order history.
create or replace function public.admin_hard_delete_store(p_store_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  order_count bigint;
begin
  if not public.is_hala_primary_admin() then
    raise exception 'Only the primary admin can permanently delete a store';
  end if;

  select count(*) into order_count from public.orders where store_id=p_store_id;
  if order_count > 0 then
    raise exception 'This store has % historical orders. Archive it instead of deleting it.', order_count;
  end if;

  delete from public.stores where id=p_store_id;
  if not found then raise exception 'Store not found'; end if;
  return true;
end;
$$;
revoke all on function public.admin_hard_delete_store(uuid) from public;
grant execute on function public.admin_hard_delete_store(uuid) to authenticated;

notify pgrst, 'reload schema';
