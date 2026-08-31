-- Hala Talab Admin Stage 9
-- صلاحيات المدراء + مراجعة Policies/RLS للوحة الإدارة.
-- آمن للتشغيل أكثر من مرة، ولا يغيّر سياسات تطبيقات العميل/المتجر/السائق تلقائياً.

create table if not exists public.admin_permissions (
  admin_id uuid primary key references auth.users(id) on delete cascade,
  can_dashboard boolean not null default true,
  can_orders boolean not null default true,
  can_stores boolean not null default true,
  can_drivers boolean not null default true,
  can_users boolean not null default true,
  can_reports boolean not null default true,
  can_system boolean not null default true,
  can_security boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_permissions enable row level security;

drop policy if exists "hala admins read admin permissions" on public.admin_permissions;
create policy "hala admins read admin permissions"
on public.admin_permissions for select to authenticated
using (public.is_hala_admin());

drop policy if exists "hala admins manage admin permissions" on public.admin_permissions;
create policy "hala admins manage admin permissions"
on public.admin_permissions for all to authenticated
using (public.is_hala_admin()) with check (public.is_hala_admin());

-- Existing admins receive full permissions so Stage 9 never breaks the current admin account.
insert into public.admin_permissions(admin_id)
select id from public.admin_users
where role='admin' and coalesce(is_active,true)=true
on conflict(admin_id) do nothing;

create or replace function public.admin_has_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare p public.admin_permissions%rowtype;
begin
  if not public.is_hala_admin() then return false; end if;
  select * into p from public.admin_permissions where admin_id=auth.uid();
  if not found then return true; end if; -- backwards-safe for an admin not yet seeded
  return case lower(coalesce(p_permission,''))
    when 'dashboard' then p.can_dashboard
    when 'orders' then p.can_orders
    when 'stores' then p.can_stores
    when 'drivers' then p.can_drivers
    when 'users' then p.can_users
    when 'reports' then p.can_reports
    when 'system' then p.can_system
    when 'security' then p.can_security
    else false end;
end;
$$;
revoke all on function public.admin_has_permission(text) from public;
grant execute on function public.admin_has_permission(text) to authenticated;

create or replace function public.admin_security_list_admins()
returns table(
  user_id uuid, email text, display_name text, admin_active boolean,
  can_dashboard boolean, can_orders boolean, can_stores boolean, can_drivers boolean,
  can_users boolean, can_reports boolean, can_system boolean, can_security boolean,
  permissions_updated_at timestamptz
)
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if not public.is_hala_admin() or not public.admin_has_permission('security') then
    raise exception 'Security permission required';
  end if;
  return query
  select u.id,u.email::text,coalesce(p.full_name,u.email,'مدير')::text,coalesce(a.is_active,true),
         coalesce(ap.can_dashboard,true),coalesce(ap.can_orders,true),coalesce(ap.can_stores,true),coalesce(ap.can_drivers,true),
         coalesce(ap.can_users,true),coalesce(ap.can_reports,true),coalesce(ap.can_system,true),coalesce(ap.can_security,true),
         ap.updated_at
  from public.admin_users a
  join auth.users u on u.id=a.id
  left join public.partner_profiles p on p.id=u.id
  left join public.admin_permissions ap on ap.admin_id=u.id
  where a.role='admin'
  order by coalesce(a.is_active,true) desc,u.created_at;
end;
$$;
revoke all on function public.admin_security_list_admins() from public;
grant execute on function public.admin_security_list_admins() to authenticated;

create or replace function public.admin_security_update_permissions(
  p_admin_id uuid,
  p_dashboard boolean,
  p_orders boolean,
  p_stores boolean,
  p_drivers boolean,
  p_users boolean,
  p_reports boolean,
  p_system boolean,
  p_security boolean
)
returns boolean
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if not public.is_hala_admin() or not public.admin_has_permission('security') then
    raise exception 'Security permission required';
  end if;
  if not exists(select 1 from public.admin_users a where a.id=p_admin_id and a.role='admin' and coalesce(a.is_active,true)=true) then
    raise exception 'Target user is not an active admin';
  end if;
  if p_admin_id=auth.uid() and coalesce(p_security,false)=false then
    raise exception 'You cannot remove your own security permission';
  end if;
  if coalesce(p_dashboard,false)=false and p_admin_id=auth.uid() then
    raise exception 'You cannot remove your own dashboard permission';
  end if;

  insert into public.admin_permissions(admin_id,can_dashboard,can_orders,can_stores,can_drivers,can_users,can_reports,can_system,can_security,updated_by,updated_at)
  values(p_admin_id,coalesce(p_dashboard,false),coalesce(p_orders,false),coalesce(p_stores,false),coalesce(p_drivers,false),coalesce(p_users,false),coalesce(p_reports,false),coalesce(p_system,false),coalesce(p_security,false),auth.uid(),now())
  on conflict(admin_id) do update set
    can_dashboard=excluded.can_dashboard,can_orders=excluded.can_orders,can_stores=excluded.can_stores,can_drivers=excluded.can_drivers,
    can_users=excluded.can_users,can_reports=excluded.can_reports,can_system=excluded.can_system,can_security=excluded.can_security,
    updated_by=auth.uid(),updated_at=now();

  if to_regclass('public.admin_audit_log') is not null then
    insert into public.admin_audit_log(admin_id,action,entity_type,entity_id,details)
    values(auth.uid(),'update_admin_permissions','admin_user',p_admin_id::text,
      jsonb_build_object('dashboard',p_dashboard,'orders',p_orders,'stores',p_stores,'drivers',p_drivers,'users',p_users,'reports',p_reports,'system',p_system,'security',p_security));
  end if;
  return true;
end;
$$;
revoke all on function public.admin_security_update_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public;
grant execute on function public.admin_security_update_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.admin_security_policy_report()
returns table(table_name text, rls_enabled boolean, policy_count bigint, admin_policy_count bigint, note text)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if not public.is_hala_admin() or not public.admin_has_permission('security') then raise exception 'Security permission required'; end if;
  return query
  with wanted(name) as (values
    ('admin_users'),('admin_user_controls'),('admin_permissions'),('admin_store_reviews'),('admin_driver_reviews'),('admin_driver_documents'),
    ('admin_commission_rules'),('admin_subscriptions'),('admin_system_settings'),('admin_audit_log'),
    ('orders'),('stores'),('coupons'),('product_categories'),('customer_support_conversations')
  )
  select w.name::text,
         coalesce(c.relrowsecurity,false),
         (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=w.name)::bigint,
         (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=w.name and (lower(p.policyname) like '%admin%' or coalesce(p.qual,'') like '%is_hala_admin%' or coalesce(p.with_check,'') like '%is_hala_admin%'))::bigint,
         case when c.oid is null then 'الجدول غير موجود' when not c.relrowsecurity then 'RLS غير مفعّل — يحتاج مراجعة' else 'RLS مفعّل' end::text
  from wanted w
  left join pg_class c on c.relname=w.name and c.relnamespace=(select oid from pg_namespace where nspname='public')
  order by case when c.oid is null then 2 when c.relrowsecurity then 1 else 0 end,w.name;
end;
$$;
revoke all on function public.admin_security_policy_report() from public;
grant execute on function public.admin_security_policy_report() to authenticated;

create or replace function public.admin_security_summary()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_admins int; v_rls int;
begin
  if not public.is_hala_admin() or not public.admin_has_permission('security') then raise exception 'Security permission required'; end if;
  select count(*) into v_admins from public.admin_users where role='admin' and coalesce(is_active,true)=true;
  select count(*) into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity=true;
  return jsonb_build_object('active_admins',v_admins,'rls_enabled_tables',v_rls);
end;
$$;
revoke all on function public.admin_security_summary() from public;
grant execute on function public.admin_security_summary() to authenticated;

notify pgrst, 'reload schema';
