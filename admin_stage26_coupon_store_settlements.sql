-- Hala Talab Admin Stage 26
-- Central coupon store settlements: know which store received each discounted order and what Hala Talab owes it.
-- Run ONCE after admin_stage25_platform_coupon_campaigns.sql. Safe/re-runnable; no business data is deleted.

begin;
create extension if not exists pgcrypto;

create table if not exists public.platform_coupon_settlements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.platform_coupon_campaigns(id) on delete set null,
  coupon_usage_id uuid unique,
  coupon_id uuid,
  order_id uuid,
  order_number text,
  store_id uuid,
  store_name text,
  customer_id uuid,
  coupon_code text,
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  order_total numeric(12,2) not null default 0 check (order_total >= 0),
  order_status text,
  settlement_status text not null default 'pending' check (settlement_status in ('pending','payable','paid','void')),
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists platform_coupon_settlements_store_idx on public.platform_coupon_settlements(store_id, settlement_status, created_at desc);
create index if not exists platform_coupon_settlements_campaign_idx on public.platform_coupon_settlements(campaign_id, created_at desc);
create index if not exists platform_coupon_settlements_order_idx on public.platform_coupon_settlements(order_id);

alter table public.platform_coupon_settlements enable row level security;
drop policy if exists "hala admins manage coupon settlements" on public.platform_coupon_settlements;
create policy "hala admins manage coupon settlements" on public.platform_coupon_settlements
for all to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin());

create or replace function public._platform_coupon_settlement_status(p_order_status text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_order_status,'')) in ('delivered','completed','تم التسليم','مكتمل') then 'payable'
    when lower(coalesce(p_order_status,'')) in ('cancelled','canceled','rejected','ملغي','ملغى','مرفوض') then 'void'
    else 'pending'
  end;
$$;

create or replace function public._record_platform_coupon_settlement_from_usage()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_campaign uuid;
  v_code text;
  v_order public.orders;
  v_store_name text;
  v_status text;
begin
  select c.platform_campaign_id, c.code into v_campaign, v_code
  from public.coupons c where c.id = new.coupon_id;
  if v_campaign is null then return new; end if;

  select * into v_order from public.orders o where o.id = new.order_id;
  if not found then return new; end if;
  select s.name into v_store_name from public.stores s where s.id = v_order.store_id;
  v_status := public._platform_coupon_settlement_status(v_order.status);

  insert into public.platform_coupon_settlements(
    campaign_id,coupon_usage_id,coupon_id,order_id,order_number,store_id,store_name,customer_id,coupon_code,
    discount_amount,order_total,order_status,settlement_status,created_at,updated_at
  ) values (
    v_campaign,new.id,new.coupon_id,new.order_id,coalesce(v_order.order_number::text,new.order_id::text),v_order.store_id,v_store_name,new.customer_id,v_code,
    greatest(coalesce(new.discount_amount,0),0),greatest(coalesce(v_order.total,0),0),v_order.status,v_status,coalesce(new.created_at,now()),now()
  )
  on conflict (coupon_usage_id) do update set
    campaign_id=excluded.campaign_id,coupon_id=excluded.coupon_id,order_id=excluded.order_id,order_number=excluded.order_number,
    store_id=excluded.store_id,store_name=excluded.store_name,customer_id=excluded.customer_id,coupon_code=excluded.coupon_code,
    discount_amount=excluded.discount_amount,order_total=excluded.order_total,order_status=excluded.order_status,
    settlement_status=case when public.platform_coupon_settlements.settlement_status='paid' then 'paid' else excluded.settlement_status end,
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists coupon_usages_platform_settlement_ins on public.coupon_usages;
create trigger coupon_usages_platform_settlement_ins
after insert or update of discount_amount,order_id on public.coupon_usages
for each row execute function public._record_platform_coupon_settlement_from_usage();

create or replace function public._sync_platform_coupon_settlement_order_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
  if new.status is not distinct from old.status and new.total is not distinct from old.total then return new; end if;
  v_status := public._platform_coupon_settlement_status(new.status);
  update public.platform_coupon_settlements s
  set order_status=new.status,
      order_total=greatest(coalesce(new.total,0),0),
      settlement_status=case when s.settlement_status='paid' then 'paid' else v_status end,
      updated_at=now()
  where s.order_id=new.id;
  return new;
end;
$$;

drop trigger if exists orders_platform_coupon_settlement_status_upd on public.orders;
create trigger orders_platform_coupon_settlement_status_upd
after update of status,total on public.orders
for each row execute function public._sync_platform_coupon_settlement_order_status();

-- Backfill already-used central coupons, preserving any existing paid marker.
insert into public.platform_coupon_settlements(
  campaign_id,coupon_usage_id,coupon_id,order_id,order_number,store_id,store_name,customer_id,coupon_code,
  discount_amount,order_total,order_status,settlement_status,created_at,updated_at
)
select c.platform_campaign_id,cu.id,cu.coupon_id,cu.order_id,coalesce(o.order_number::text,cu.order_id::text),o.store_id,s.name,cu.customer_id,c.code,
       greatest(coalesce(cu.discount_amount,0),0),greatest(coalesce(o.total,0),0),o.status,
       public._platform_coupon_settlement_status(o.status),cu.created_at,now()
from public.coupon_usages cu
join public.coupons c on c.id=cu.coupon_id and c.platform_campaign_id is not null
join public.orders o on o.id=cu.order_id
left join public.stores s on s.id=o.store_id
on conflict (coupon_usage_id) do update set
  order_number=excluded.order_number,store_id=excluded.store_id,store_name=excluded.store_name,coupon_code=excluded.coupon_code,
  discount_amount=excluded.discount_amount,order_total=excluded.order_total,order_status=excluded.order_status,
  settlement_status=case when public.platform_coupon_settlements.settlement_status='paid' then 'paid' else excluded.settlement_status end,
  updated_at=now();

create or replace function public.admin_set_platform_coupon_settlement_paid(
  p_settlement_id uuid,
  p_paid boolean,
  p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_row public.platform_coupon_settlements;
begin
  if not public.is_hala_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into v_row from public.platform_coupon_settlements where id=p_settlement_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if coalesce(p_paid,false) and v_row.settlement_status='void' then raise exception 'CANCELLED_ORDER_NOT_PAYABLE'; end if;
  if coalesce(p_paid,false) and public._platform_coupon_settlement_status(v_row.order_status)<>'payable' then raise exception 'ORDER_NOT_DELIVERED'; end if;
  update public.platform_coupon_settlements
  set settlement_status=case when coalesce(p_paid,false) then 'paid' else public._platform_coupon_settlement_status(order_status) end,
      paid_at=case when coalesce(p_paid,false) then now() else null end,
      paid_by=case when coalesce(p_paid,false) then auth.uid() else null end,
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_settlement_id;
end;
$$;
revoke all on function public.admin_set_platform_coupon_settlement_paid(uuid,boolean,text) from public;
grant execute on function public.admin_set_platform_coupon_settlement_paid(uuid,boolean,text) to authenticated;

notify pgrst,'reload schema';
commit;

select to_regclass('public.platform_coupon_settlements') is not null as settlements_ready,
       to_regprocedure('public.admin_set_platform_coupon_settlement_paid(uuid,boolean,text)') is not null as mark_paid_ready;
