-- Hala Talab — Driver ↔ Store Assignment System
-- Admin Stage 22 / Partners Stage 185
-- Run ONCE in Supabase SQL Editor. Safe/idempotent. No existing orders are deleted.

create table if not exists public.driver_delivery_scope (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  driver_type text not null default 'store' check (driver_type in ('store','hala')),
  store_id uuid references public.stores(id) on delete set null,
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_delivery_scope_store_required check (
    (driver_type='store' and store_id is not null) or (driver_type='hala' and store_id is null)
  )
);
create index if not exists driver_delivery_scope_store_idx on public.driver_delivery_scope(store_id) where is_active;
alter table public.driver_delivery_scope enable row level security;

drop policy if exists "driver scope admin read" on public.driver_delivery_scope;
create policy "driver scope admin read" on public.driver_delivery_scope for select to authenticated using (public.is_admin());
drop policy if exists "driver scope self read" on public.driver_delivery_scope;
create policy "driver scope self read" on public.driver_delivery_scope for select to authenticated using (driver_id=auth.uid());
drop policy if exists "driver scope store owner read" on public.driver_delivery_scope;
create policy "driver scope store owner read" on public.driver_delivery_scope for select to authenticated using (
  store_id is not null and exists(select 1 from public.stores s where s.id=store_id and s.owner_id=auth.uid())
);
revoke insert,update,delete on public.driver_delivery_scope from authenticated,anon;

create or replace function public.admin_set_driver_delivery_scope(p_driver_id uuid,p_driver_type text,p_store_id uuid default null)
returns public.driver_delivery_scope
language plpgsql security definer set search_path=public as $$
declare v_type text:=lower(coalesce(p_driver_type,'')); v_row public.driver_delivery_scope;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if v_type not in ('store','hala') then raise exception 'Invalid driver type'; end if;
  if v_type='store' then
    if p_store_id is null then raise exception 'Store is required for store driver'; end if;
    if not exists(select 1 from public.stores where id=p_store_id) then raise exception 'Store not found'; end if;
  else p_store_id:=null;
  end if;
  insert into public.driver_delivery_scope(driver_id,driver_type,store_id,is_active,assigned_by,assigned_at,updated_at)
  values(p_driver_id,v_type,p_store_id,true,auth.uid(),now(),now())
  on conflict(driver_id) do update set driver_type=excluded.driver_type,store_id=excluded.store_id,is_active=true,assigned_by=auth.uid(),assigned_at=now(),updated_at=now()
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.admin_set_driver_delivery_scope(uuid,text,uuid) from public;
grant execute on function public.admin_set_driver_delivery_scope(uuid,text,uuid) to authenticated;

create or replace function public.driver_can_take_store(p_driver_id uuid,p_store_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select d.is_active and (d.driver_type='hala' or (d.driver_type='store' and d.store_id=p_store_id)) from public.driver_delivery_scope d where d.driver_id=p_driver_id),false)
$$;
revoke all on function public.driver_can_take_store(uuid,uuid) from public;
grant execute on function public.driver_can_take_store(uuid,uuid) to authenticated;

create or replace function public.get_available_driver_delivery_offer()
returns table(order_id uuid,order_number bigint,store_id uuid,store_name text,store_address text,customer_name text,customer_phone text,delivery_address text,delivery_fee numeric,payment_method text,created_at timestamptz)
language sql security definer set search_path=public as $$
  select o.id,o.order_number,o.store_id,s.name,s.address_text,o.customer_name,o.customer_phone,o.delivery_address,o.delivery_fee,o.payment_method,o.created_at
  from public.orders o join public.stores s on s.id=o.store_id
  where auth.uid() is not null
    and public.driver_can_take_store(auth.uid(),o.store_id)
    and (select count(*) from public.orders a where a.driver_id=auth.uid() and a.status in ('ready','assigned','picked_up')) < 10
    and o.status='ready' and o.driver_id is null
    and not exists(select 1 from public.driver_order_rejections r where r.driver_id=auth.uid() and r.order_id=o.id)
  order by o.ready_at nulls last,o.created_at limit 1
$$;

create or replace function public.claim_driver_delivery_offer(p_order_id uuid)
returns table(order_id uuid,order_number bigint,store_id uuid,store_name text,store_address text,customer_name text,customer_phone text,delivery_address text,delivery_fee numeric,payment_method text,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_active_count integer; v_store uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select store_id into v_store from public.orders where id=p_order_id;
 if v_store is null or not public.driver_can_take_store(auth.uid(),v_store) then raise exception 'This order is not available for your assigned store'; end if;
 return query select o.id,o.order_number,o.store_id,s.name,s.address_text,o.customer_name,o.customer_phone,o.delivery_address,o.delivery_fee,o.payment_method,o.created_at from public.orders o join public.stores s on s.id=o.store_id where o.id=p_order_id and o.driver_id=auth.uid() and o.status in ('ready','assigned','picked_up') limit 1;
 if found then return; end if;
 select count(*)::int into v_active_count from public.orders where driver_id=auth.uid() and status in ('ready','assigned','picked_up');
 if v_active_count>=10 then raise exception 'Driver active order limit reached'; end if;
 return query with claimed as (update public.orders o set driver_id=auth.uid(),updated_at=now() where o.id=p_order_id and o.status='ready' and o.driver_id is null and public.driver_can_take_store(auth.uid(),o.store_id) returning o.*)
 select c.id,c.order_number,c.store_id,s.name,s.address_text,c.customer_name,c.customer_phone,c.delivery_address,c.delivery_fee,c.payment_method,c.created_at from claimed c join public.stores s on s.id=c.store_id;
 if not found then raise exception 'Delivery offer is no longer available'; end if;
end $$;

create or replace function public.reject_driver_delivery_offer(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.driver_order_rejections(driver_id,order_id)
 select auth.uid(),o.id from public.orders o where o.id=p_order_id and o.status='ready' and o.driver_id is null and public.driver_can_take_store(auth.uid(),o.store_id)
 on conflict(driver_id,order_id) do nothing;
end $$;

create or replace function public.store_get_order_drivers_v1(p_store_id uuid)
returns table(driver_id uuid,full_name text,phone text)
language sql security definer set search_path=public as $$
 select d.driver_id,coalesce(nullif(trim(p.full_name),''),'سائق') as full_name,coalesce(p.phone,'') as phone
 from public.driver_delivery_scope d left join public.partner_profiles p on p.id=d.driver_id
 where d.store_id=p_store_id and d.driver_type='store' and d.is_active
   and exists(select 1 from public.stores s where s.id=p_store_id and (s.owner_id=auth.uid() or public.is_admin()))
 order by full_name
$$;

revoke all on function public.get_available_driver_delivery_offer() from public;
revoke all on function public.claim_driver_delivery_offer(uuid) from public;
revoke all on function public.reject_driver_delivery_offer(uuid) from public;
revoke all on function public.store_get_order_drivers_v1(uuid) from public;
grant execute on function public.get_available_driver_delivery_offer() to authenticated;
grant execute on function public.claim_driver_delivery_offer(uuid) to authenticated;
grant execute on function public.reject_driver_delivery_offer(uuid) to authenticated;
grant execute on function public.store_get_order_drivers_v1(uuid) to authenticated;

notify pgrst,'reload schema';
