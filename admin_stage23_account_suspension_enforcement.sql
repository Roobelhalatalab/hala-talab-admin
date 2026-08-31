-- Hala Talab — Account Suspension Enforcement
-- Central server-side enforcement for customers, store owners and drivers.
-- Safe/idempotent. Does not delete accounts, orders, stores or history.

begin;

-- Canonical account state. Missing control row means active.
create or replace function public.hala_account_access_status(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_user_id is null then 'anonymous'
    else coalesce((
      select c.access_status
      from public.admin_user_controls c
      where c.user_id = p_user_id
      limit 1
    ), 'active')
  end;
$$;

revoke all on function public.hala_account_access_status(uuid) from public;
grant execute on function public.hala_account_access_status(uuid) to authenticated;

create or replace function public.hala_account_is_operational(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hala_account_access_status(p_user_id) not in ('suspended','blocked');
$$;

revoke all on function public.hala_account_is_operational(uuid) from public;
grant execute on function public.hala_account_is_operational(uuid) to authenticated;

-- Used by apps to show a clear suspended-account screen/message if desired.
create or replace function public.get_my_account_access_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_notes text := '';
begin
  if v_uid is null then
    return jsonb_build_object('authenticated',false,'status','anonymous','operational',false,'reason','');
  end if;

  select coalesce(c.access_status,'active'), coalesce(c.notes,'')
    into v_status, v_notes
  from (select v_uid as user_id) x
  left join public.admin_user_controls c on c.user_id=x.user_id;

  return jsonb_build_object(
    'authenticated', true,
    'status', coalesce(v_status,'active'),
    'operational', coalesce(v_status,'active') not in ('suspended','blocked'),
    'reason', coalesce(v_notes,'')
  );
end;
$$;

revoke all on function public.get_my_account_access_state() from public;
grant execute on function public.get_my_account_access_state() to authenticated;

-- One write gate for all sensitive tables. RLS/UI can no longer be bypassed by
-- a stale app build or a direct RPC when the account is administratively suspended.
create or replace function public.hala_enforce_operational_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_row jsonb;
  v_store_id uuid;
  v_store_lifecycle text;
begin
  -- service/background jobs have no auth.uid(); admin dashboard must remain able
  -- to suspend/reactivate and perform recovery actions.
  if v_uid is null or public.is_hala_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_status := public.hala_account_access_status(v_uid);
  if v_status in ('suspended','blocked') then
    raise exception 'ACCOUNT_SUSPENDED' using errcode='P0001';
  end if;

  -- Also enforce store lifecycle for the owner even if the owner's personal
  -- account itself is active.
  if tg_op='DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;

  begin
    if tg_table_name='stores' then
      v_store_id := nullif(v_row->>'id','')::uuid;
    elsif v_row ? 'store_id' then
      v_store_id := nullif(v_row->>'store_id','')::uuid;
    else
      v_store_id := null;
    end if;
  exception when others then
    v_store_id := null;
  end;

  if v_store_id is not null
     and exists(select 1 from public.stores s where s.id=v_store_id and s.owner_id=v_uid)
  then
    select coalesce(sc.lifecycle_status,'active')
      into v_store_lifecycle
    from (select v_store_id as store_id) x
    left join public.admin_store_controls sc on sc.store_id=x.store_id;

    if coalesce(v_store_lifecycle,'active') in ('paused','archived') then
      raise exception 'STORE_SUSPENDED' using errcode='P0001';
    end if;
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

-- Attach the gate only to tables that exist in this project.
do $$
declare
  t text;
  tables_to_guard text[] := array[
    'orders',
    'customer_support_conversations','customer_support_messages',
    'partner_support_tickets','partner_support_messages',
    'stores','products','product_categories','product_variants',
    'product_addons','product_addon_links',
    'coupons','store_promotions','store_reviews','product_reviews','driver_reviews'
  ];
begin
  foreach t in array tables_to_guard loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists hala_operational_write_guard on public.%I', t);
      execute format(
        'create trigger hala_operational_write_guard before insert or update or delete on public.%I for each row execute function public.hala_enforce_operational_write()',
        t
      );
    end if;
  end loop;
end $$;

-- Driver eligibility must include the administrative account state. This also
-- stops new driver-offer notifications/pushes for suspended or blocked drivers.
create or replace function public.driver_can_take_store(p_driver_id uuid, p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hala_account_is_operational(p_driver_id)
     and coalesce((
       select d.is_active
          and (
            d.driver_type='hala'
            or (d.driver_type='store' and d.store_id=p_store_id)
          )
       from public.driver_delivery_scope d
       where d.driver_id=p_driver_id
       limit 1
     ), false);
$$;

revoke all on function public.driver_can_take_store(uuid,uuid) from public;
grant execute on function public.driver_can_take_store(uuid,uuid) to authenticated;

-- When an admin suspends a driver, invalidate outstanding available notifications
-- so an old notification cannot be used as a stale entry point. History remains.
create or replace function public.hala_on_account_control_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.access_status in ('suspended','blocked') then
    if to_regclass('public.driver_notifications') is not null then
      update public.driver_notifications
         set is_read=true
       where driver_id=new.user_id and coalesce(is_read,false)=false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists hala_account_control_change on public.admin_user_controls;
create trigger hala_account_control_change
after insert or update of access_status on public.admin_user_controls
for each row execute function public.hala_on_account_control_change();

notify pgrst, 'reload schema';
commit;
