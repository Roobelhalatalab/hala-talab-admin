-- Hala Talab Admin Stage 25
-- Platform-wide coupon campaigns (e.g. first 20 / 60 orders) + safe store materialization.
-- Run ONCE after the existing coupon/order migrations. Re-runnable and does not delete existing business data.

begin;
create extension if not exists pgcrypto;

create table if not exists public.platform_coupon_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  discount_type text not null default 'percentage' check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  max_discount numeric(12,2),
  usage_limit integer,
  used_count integer not null default 0,
  per_customer_limit integer not null default 1,
  first_order_only boolean not null default false,
  start_at timestamptz not null default now(),
  end_at timestamptz not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  check (usage_limit is null or usage_limit > 0),
  check (used_count >= 0),
  check (per_customer_limit > 0),
  check (max_discount is null or max_discount > 0),
  check (discount_type <> 'percentage' or discount_value <= 100)
);
create unique index if not exists platform_coupon_campaign_code_uidx on public.platform_coupon_campaigns(upper(code));
create index if not exists platform_coupon_campaign_active_idx on public.platform_coupon_campaigns(is_active,start_at,end_at);

alter table public.coupons add column if not exists platform_campaign_id uuid references public.platform_coupon_campaigns(id) on delete cascade;
create index if not exists coupons_platform_campaign_idx on public.coupons(platform_campaign_id,store_id);
create unique index if not exists coupons_platform_campaign_store_uidx on public.coupons(platform_campaign_id,store_id) where platform_campaign_id is not null;

alter table public.platform_coupon_campaigns enable row level security;
drop policy if exists "hala admins manage platform coupon campaigns" on public.platform_coupon_campaigns;
create policy "hala admins manage platform coupon campaigns" on public.platform_coupon_campaigns
for all to authenticated using (public.is_hala_admin()) with check (public.is_hala_admin());

-- Store owners can keep managing their own coupons, but never a Hala Talab central child coupon.
drop policy if exists "owners manage own coupons" on public.coupons;
create policy "owners manage own coupons" on public.coupons
for all to authenticated
using (
  platform_campaign_id is null and exists (
    select 1 from public.stores s where s.id=coupons.store_id and s.owner_id=auth.uid()
  )
)
with check (
  platform_campaign_id is null and exists (
    select 1 from public.stores s where s.id=coupons.store_id and s.owner_id=auth.uid()
  )
);

create or replace function public._sync_platform_coupon_campaign(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v public.platform_coupon_campaigns;
begin
  select * into v from public.platform_coupon_campaigns where id=p_campaign_id;
  if not found then return; end if;

  -- Update existing materialized coupons.
  update public.coupons c set
    code=v.code,title=v.title,discount_type=v.discount_type,discount_value=v.discount_value,
    minimum_order=v.minimum_order,max_discount=v.max_discount,usage_limit=v.usage_limit,
    per_customer_limit=v.per_customer_limit,start_at=v.start_at,end_at=v.end_at,
    is_active=v.is_active,updated_at=now()
  where c.platform_campaign_id=v.id;

  -- Add to every store that does not already have the campaign. The existing client
  -- continues to see a normal store coupon, so no client-side schema fork is needed.
  insert into public.coupons(
    store_id,code,title,discount_type,discount_value,minimum_order,max_discount,
    usage_limit,used_count,start_at,end_at,is_active,per_customer_limit,platform_campaign_id
  )
  select s.id,v.code,v.title,v.discount_type,v.discount_value,v.minimum_order,v.max_discount,
         v.usage_limit,0,v.start_at,v.end_at,v.is_active,v.per_customer_limit,v.id
    from public.stores s
   where not exists(select 1 from public.coupons c where c.platform_campaign_id=v.id and c.store_id=s.id);
end;
$$;
revoke all on function public._sync_platform_coupon_campaign(uuid) from public;

create or replace function public._sync_platform_campaigns_for_new_store()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.coupons(
    store_id,code,title,discount_type,discount_value,minimum_order,max_discount,
    usage_limit,used_count,start_at,end_at,is_active,per_customer_limit,platform_campaign_id
  )
  select new.id,p.code,p.title,p.discount_type,p.discount_value,p.minimum_order,p.max_discount,
         p.usage_limit,0,p.start_at,p.end_at,p.is_active,p.per_customer_limit,p.id
    from public.platform_coupon_campaigns p
   where p.end_at>now()
     and not exists(select 1 from public.coupons c where c.platform_campaign_id=p.id and c.store_id=new.id);
  return new;
end;
$$;
drop trigger if exists stores_sync_platform_coupon_campaigns on public.stores;
create trigger stores_sync_platform_coupon_campaigns after insert on public.stores
for each row execute function public._sync_platform_campaigns_for_new_store();

create or replace function public._platform_coupon_usage_counter()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_campaign uuid;
begin
  if tg_op='DELETE' then
    select platform_campaign_id into v_campaign from public.coupons where id=old.coupon_id;
    if v_campaign is not null then update public.platform_coupon_campaigns set used_count=greatest(used_count-1,0),updated_at=now() where id=v_campaign; end if;
    return old;
  end if;
  select platform_campaign_id into v_campaign from public.coupons where id=new.coupon_id;
  if v_campaign is not null then update public.platform_coupon_campaigns set used_count=used_count+1,updated_at=now() where id=v_campaign; end if;
  return new;
end;
$$;
drop trigger if exists coupon_usages_platform_counter_ins on public.coupon_usages;
create trigger coupon_usages_platform_counter_ins after insert on public.coupon_usages
for each row execute function public._platform_coupon_usage_counter();
drop trigger if exists coupon_usages_platform_counter_del on public.coupon_usages;
create trigger coupon_usages_platform_counter_del after delete on public.coupon_usages
for each row execute function public._platform_coupon_usage_counter();

create or replace function public.admin_create_platform_coupon_campaign(
  p_code text,p_title text,p_discount_type text,p_discount_value numeric,
  p_minimum_order numeric default 0,p_max_discount numeric default null,
  p_usage_limit integer default null,p_per_customer_limit integer default 1,
  p_first_order_only boolean default false,p_start_at timestamptz default now(),
  p_end_at timestamptz default (now()+interval '30 days'),p_is_active boolean default true
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_type text:=lower(trim(coalesce(p_discount_type,'percentage'))); v_code text:=upper(trim(coalesce(p_code,'')));
begin
  if not public.is_hala_admin() then raise exception 'ADMIN_ONLY'; end if;
  if v_code='' or trim(coalesce(p_title,''))='' then raise exception 'CODE_AND_TITLE_REQUIRED'; end if;
  if v_type not in ('percentage','fixed') then raise exception 'INVALID_DISCOUNT_TYPE'; end if;
  if coalesce(p_discount_value,0)<=0 or (v_type='percentage' and p_discount_value>100) then raise exception 'INVALID_DISCOUNT_VALUE'; end if;
  if p_end_at<=p_start_at then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_usage_limit is not null and p_usage_limit<1 then raise exception 'INVALID_USAGE_LIMIT'; end if;
  if coalesce(p_per_customer_limit,0)<1 then raise exception 'INVALID_CUSTOMER_LIMIT'; end if;
  if exists(select 1 from public.coupons c where upper(c.code)=v_code and c.platform_campaign_id is null) then raise exception 'CODE_CONFLICT_WITH_STORE_COUPON'; end if;
  insert into public.platform_coupon_campaigns(code,title,discount_type,discount_value,minimum_order,max_discount,usage_limit,per_customer_limit,first_order_only,start_at,end_at,is_active,created_by)
  values(v_code,trim(p_title),v_type,p_discount_value,greatest(coalesce(p_minimum_order,0),0),case when coalesce(p_max_discount,0)>0 then p_max_discount else null end,p_usage_limit,p_per_customer_limit,coalesce(p_first_order_only,false),p_start_at,p_end_at,coalesce(p_is_active,true),auth.uid()) returning id into v_id;
  perform public._sync_platform_coupon_campaign(v_id);
  return v_id;
end;
$$;
revoke all on function public.admin_create_platform_coupon_campaign(text,text,text,numeric,numeric,numeric,integer,integer,boolean,timestamptz,timestamptz,boolean) from public;
grant execute on function public.admin_create_platform_coupon_campaign(text,text,text,numeric,numeric,numeric,integer,integer,boolean,timestamptz,timestamptz,boolean) to authenticated;

create or replace function public.admin_update_platform_coupon_campaign(
  p_campaign_id uuid,p_code text,p_title text,p_discount_type text,p_discount_value numeric,
  p_minimum_order numeric default 0,p_max_discount numeric default null,
  p_usage_limit integer default null,p_per_customer_limit integer default 1,
  p_first_order_only boolean default false,p_start_at timestamptz default now(),
  p_end_at timestamptz default (now()+interval '30 days'),p_is_active boolean default true
) returns void language plpgsql security definer set search_path=public as $$
declare v_type text:=lower(trim(coalesce(p_discount_type,'percentage'))); v_code text:=upper(trim(coalesce(p_code,'')));
begin
  if not public.is_hala_admin() then raise exception 'ADMIN_ONLY'; end if;
  if v_code='' or trim(coalesce(p_title,''))='' then raise exception 'CODE_AND_TITLE_REQUIRED'; end if;
  if v_type not in ('percentage','fixed') then raise exception 'INVALID_DISCOUNT_TYPE'; end if;
  if coalesce(p_discount_value,0)<=0 or (v_type='percentage' and p_discount_value>100) then raise exception 'INVALID_DISCOUNT_VALUE'; end if;
  if p_end_at<=p_start_at then raise exception 'INVALID_DATE_RANGE'; end if;
  if exists(select 1 from public.coupons c where upper(c.code)=v_code and c.platform_campaign_id is null) then raise exception 'CODE_CONFLICT_WITH_STORE_COUPON'; end if;
  update public.platform_coupon_campaigns set code=v_code,title=trim(p_title),discount_type=v_type,discount_value=p_discount_value,
    minimum_order=greatest(coalesce(p_minimum_order,0),0),max_discount=case when coalesce(p_max_discount,0)>0 then p_max_discount else null end,
    usage_limit=p_usage_limit,per_customer_limit=greatest(coalesce(p_per_customer_limit,1),1),first_order_only=coalesce(p_first_order_only,false),
    start_at=p_start_at,end_at=p_end_at,is_active=coalesce(p_is_active,true),updated_at=now()
  where id=p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  perform public._sync_platform_coupon_campaign(p_campaign_id);
end;
$$;
revoke all on function public.admin_update_platform_coupon_campaign(uuid,text,text,text,numeric,numeric,numeric,integer,integer,boolean,timestamptz,timestamptz,boolean) from public;
grant execute on function public.admin_update_platform_coupon_campaign(uuid,text,text,text,numeric,numeric,numeric,integer,integer,boolean,timestamptz,timestamptz,boolean) to authenticated;

create or replace function public.admin_set_platform_coupon_campaign_active(p_campaign_id uuid,p_is_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_hala_admin() then raise exception 'ADMIN_ONLY'; end if;
  update public.platform_coupon_campaigns set is_active=coalesce(p_is_active,false),updated_at=now() where id=p_campaign_id;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  perform public._sync_platform_coupon_campaign(p_campaign_id);
end;
$$;
revoke all on function public.admin_set_platform_coupon_campaign_active(uuid,boolean) from public;
grant execute on function public.admin_set_platform_coupon_campaign_active(uuid,boolean) to authenticated;

create or replace function public.admin_delete_platform_coupon_campaign(p_campaign_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_hala_admin() then raise exception 'ADMIN_ONLY'; end if;
  delete from public.platform_coupon_campaigns where id=p_campaign_id;
end;
$$;
revoke all on function public.admin_delete_platform_coupon_campaign(uuid) from public;
grant execute on function public.admin_delete_platform_coupon_campaign(uuid) to authenticated;

-- Shared eligibility helper for both quote RPCs.
create or replace function public._platform_campaign_coupon_eligible(p_coupon_id uuid,p_customer_id uuid)
returns boolean language plpgsql security definer set search_path=public stable as $$
declare v public.platform_coupon_campaigns; v_campaign uuid; v_uses int; v_customer_uses int; v_orders int;
begin
  select c.platform_campaign_id into v_campaign from public.coupons c where c.id=p_coupon_id;
  if v_campaign is null then return true; end if;
  select * into v from public.platform_coupon_campaigns where id=v_campaign;
  if not found or not v.is_active or now()<v.start_at or now()>=v.end_at then return false; end if;
  select count(*)::int into v_uses from public.coupon_usages cu join public.coupons c on c.id=cu.coupon_id where c.platform_campaign_id=v_campaign;
  if v.usage_limit is not null and v_uses>=v.usage_limit then return false; end if;
  if p_customer_id is not null then
    select count(*)::int into v_customer_uses from public.coupon_usages cu join public.coupons c on c.id=cu.coupon_id where c.platform_campaign_id=v_campaign and cu.customer_id=p_customer_id;
    if v_customer_uses>=v.per_customer_limit then return false; end if;
    if v.first_order_only then
      select count(*)::int into v_orders from public.orders o where o.customer_id=p_customer_id and lower(coalesce(o.status,'')) not in ('cancelled','canceled','ملغي','ملغى');
      if v_orders>0 then return false; end if;
    end if;
  elsif v.first_order_only then return false;
  end if;
  return true;
end;
$$;
revoke all on function public._platform_campaign_coupon_eligible(uuid,uuid) from public;
grant execute on function public._platform_campaign_coupon_eligible(uuid,uuid) to anon,authenticated;

-- v2 is still used by the current client's explicit coupon validation.
create or replace function public.quote_store_discount_v2(p_store_id uuid,p_subtotal numeric,p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_subtotal numeric(12,2):=greatest(coalesce(p_subtotal,0),0); v_coupon public.coupons; v_store public.stores;
  v_discount numeric(12,2):=0; v_customer_uses integer:=0; v_delivery_fee numeric(12,2):=0;
begin
  if nullif(trim(coalesce(p_coupon_code,'')),'') is null then return jsonb_build_object('discount_amount',0,'source','none','coupon_id',null,'subtotal',v_subtotal,'total_after_discount',v_subtotal); end if;
  select * into v_store from public.stores where id=p_store_id; v_delivery_fee:=greatest(coalesce(v_store.delivery_fee,0),0);
  select c.* into v_coupon from public.coupons c where c.store_id=p_store_id and upper(c.code)=upper(trim(p_coupon_code)) and c.is_active and now()>=c.start_at and now()<c.end_at and v_subtotal>=greatest(coalesce(c.minimum_order,0),0) and (c.usage_limit is null or c.used_count<c.usage_limit) limit 1;
  if not found or not public._platform_campaign_coupon_eligible(v_coupon.id,auth.uid()) then return jsonb_build_object('discount_amount',0,'source','none','coupon_id',null,'subtotal',v_subtotal,'total_after_discount',v_subtotal); end if;
  if v_coupon.platform_campaign_id is null and v_coupon.per_customer_limit is not null and auth.uid() is not null then
    select count(*)::integer into v_customer_uses from public.coupon_usages cu where cu.coupon_id=v_coupon.id and cu.customer_id=auth.uid();
    if v_customer_uses>=v_coupon.per_customer_limit then return jsonb_build_object('discount_amount',0,'source','none','coupon_id',null,'subtotal',v_subtotal,'total_after_discount',v_subtotal); end if;
  end if;
  v_discount:=case when v_coupon.discount_type='percentage' then round(v_subtotal*v_coupon.discount_value/100,2) when v_coupon.discount_type='free_delivery' then v_delivery_fee else v_coupon.discount_value end;
  if v_coupon.max_discount is not null and v_coupon.discount_type<>'free_delivery' then v_discount:=least(v_discount,v_coupon.max_discount); end if;
  v_discount:=least(greatest(v_discount,0),v_subtotal+v_delivery_fee);
  return jsonb_build_object('discount_amount',v_discount,'source','coupon','coupon_id',v_coupon.id,'platform_campaign_id',v_coupon.platform_campaign_id,'promotion_id',null,'title',v_coupon.title,'code',v_coupon.code,'subtotal',v_subtotal,'total_after_discount',greatest(v_subtotal+v_delivery_fee-v_discount,0));
end;
$$;
revoke all on function public.quote_store_discount_v2(uuid,numeric,text) from public;
grant execute on function public.quote_store_discount_v2(uuid,numeric,text) to anon,authenticated;

-- v5 compares automatic store offers with the explicit coupon; platform coupons use
-- the same child row shape, but their global limits are checked across every store.
create or replace function public.quote_store_discount_v5(p_store_id uuid,p_subtotal numeric,p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_subtotal numeric(12,2):=greatest(coalesce(p_subtotal,0),0); v_offer public.store_promotions; v_near_offer public.store_promotions; v_coupon public.coupons;
  v_offer_discount numeric(12,2):=0; v_coupon_discount numeric(12,2):=0; v_customer_uses integer:=0;
begin
  if not exists(select 1 from public.stores s where s.id=p_store_id) then raise exception 'STORE_NOT_FOUND'; end if;
  select sp.* into v_offer from public.store_promotions sp where sp.store_id=p_store_id and sp.is_active=true and now()>=sp.start_at and now()<sp.end_at and v_subtotal>=greatest(coalesce(sp.minimum_order,0),0)
  order by case when sp.discount_type='percentage' then v_subtotal*sp.discount_value/100 else sp.discount_value end desc,sp.created_at desc limit 1;
  if found then v_offer_discount:=case when v_offer.discount_type='percentage' then round(v_subtotal*v_offer.discount_value/100,2) else v_offer.discount_value end;v_offer_discount:=least(greatest(v_offer_discount,0),v_subtotal);
  else select sp.* into v_near_offer from public.store_promotions sp where sp.store_id=p_store_id and sp.is_active=true and now()>=sp.start_at and now()<sp.end_at order by greatest(coalesce(sp.minimum_order,0),0),sp.created_at desc limit 1; end if;
  if nullif(trim(coalesce(p_coupon_code,'')),'') is not null then
    select c.* into v_coupon from public.coupons c where c.store_id=p_store_id and upper(c.code)=upper(trim(p_coupon_code)) and c.is_active=true and now()>=c.start_at and now()<c.end_at and v_subtotal>=greatest(coalesce(c.minimum_order,0),0) and (c.usage_limit is null or c.used_count<c.usage_limit) limit 1;
    if found and not public._platform_campaign_coupon_eligible(v_coupon.id,auth.uid()) then v_coupon:=null; end if;
    if v_coupon.id is not null and v_coupon.platform_campaign_id is null and v_coupon.per_customer_limit is not null and auth.uid() is not null then
      select count(*)::integer into v_customer_uses from public.coupon_usages cu where cu.coupon_id=v_coupon.id and cu.customer_id=auth.uid(); if v_customer_uses>=v_coupon.per_customer_limit then v_coupon:=null; end if;
    end if;
    if v_coupon.id is not null then v_coupon_discount:=case when v_coupon.discount_type='percentage' then round(v_subtotal*v_coupon.discount_value/100,2) when v_coupon.discount_type='free_delivery' then 0 else v_coupon.discount_value end;
      if v_coupon.max_discount is not null and v_coupon.discount_type<>'free_delivery' then v_coupon_discount:=least(v_coupon_discount,v_coupon.max_discount); end if;v_coupon_discount:=least(greatest(v_coupon_discount,0),v_subtotal); end if;
  end if;
  if v_coupon_discount>v_offer_discount then return jsonb_build_object('discount_amount',v_coupon_discount,'source','coupon','coupon_id',v_coupon.id,'platform_campaign_id',v_coupon.platform_campaign_id,'promotion_id',null,'title',v_coupon.title,'code',v_coupon.code,'minimum_order',v_coupon.minimum_order,'missing_amount',0,'subtotal',v_subtotal,'total_after_discount',greatest(v_subtotal-v_coupon_discount,0));
  elsif v_offer_discount>0 then return jsonb_build_object('discount_amount',v_offer_discount,'source','promotion','coupon_id',null,'platform_campaign_id',null,'promotion_id',v_offer.id,'title',v_offer.title,'code',null,'minimum_order',v_offer.minimum_order,'missing_amount',0,'subtotal',v_subtotal,'total_after_discount',greatest(v_subtotal-v_offer_discount,0)); end if;
  if v_near_offer.id is not null and v_subtotal<greatest(coalesce(v_near_offer.minimum_order,0),0) then return jsonb_build_object('discount_amount',0,'source','none','coupon_id',null,'promotion_id',v_near_offer.id,'title',v_near_offer.title,'code',null,'minimum_order',v_near_offer.minimum_order,'missing_amount',greatest(v_near_offer.minimum_order-v_subtotal,0),'subtotal',v_subtotal,'total_after_discount',v_subtotal); end if;
  return jsonb_build_object('discount_amount',0,'source','none','coupon_id',null,'platform_campaign_id',null,'promotion_id',null,'title',null,'code',null,'minimum_order',null,'missing_amount',0,'subtotal',v_subtotal,'total_after_discount',v_subtotal);
end;
$$;
revoke all on function public.quote_store_discount_v5(uuid,numeric,text) from public;
grant execute on function public.quote_store_discount_v5(uuid,numeric,text) to anon,authenticated;

-- Rebuild v5 order wrapper with a campaign-row lock before create_customer_order_v4.
-- This serializes usage across different stores, so "first 20" cannot become 21
-- when two stores receive orders at the same moment.
create or replace function public.create_customer_order_v5(
  p_store_id uuid,p_customer_name text default null,p_customer_phone text default null,
  p_delivery_address text default null,p_payment_method text default 'cash',p_notes text default null,
  p_coupon_code text default null,p_items jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_subtotal numeric(12,2):=0;v_item jsonb;v_product public.products;v_variant public.product_variants;v_qty integer;v_base numeric(12,2);v_addons numeric(12,2);v_addon_id uuid;v_addon public.product_addons;
  v_quote jsonb;v_result jsonb;v_order_id uuid;v_discount numeric(12,2):=0;v_source text:='none';v_winning_coupon text:=null;v_delivery numeric(12,2):=0;v_new_total numeric(12,2):=0;v_campaign_id uuid;v_campaign public.platform_coupon_campaigns;v_global_uses int;v_customer_uses int;v_prior_orders int;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'EMPTY_ORDER'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=greatest(coalesce((v_item->>'quantity')::integer,1),1);select * into v_product from public.products where id=(v_item->>'product_id')::uuid and store_id=p_store_id and is_available=true;if not found then raise exception 'PRODUCT_UNAVAILABLE:%',v_item->>'product_id';end if;v_base:=v_product.price;
    if nullif(trim(coalesce(v_item->>'variant_id','')),'') is not null then select * into v_variant from public.product_variants where id=(v_item->>'variant_id')::uuid and product_id=v_product.id and is_available=true;if not found then raise exception 'PRODUCT_VARIANT_UNAVAILABLE:%',v_item->>'variant_id';end if;v_base:=v_variant.price;end if;
    v_addons:=0;if jsonb_typeof(coalesce(v_item->'addons','[]'::jsonb))='array' then for v_addon_id in select value::text::uuid from jsonb_array_elements_text(coalesce(v_item->'addons','[]'::jsonb)) loop select a.* into v_addon from public.product_addons a join public.product_addon_links l on l.addon_id=a.id where a.id=v_addon_id and l.product_id=v_product.id and a.store_id=p_store_id and a.is_active=true;if not found then raise exception 'ADDON_UNAVAILABLE:%',v_addon_id;end if;v_addons:=v_addons+coalesce(v_addon.price,0);end loop;end if;
    v_subtotal:=v_subtotal+((v_base+v_addons)*v_qty);
  end loop;
  v_quote:=public.quote_store_discount_v5(p_store_id,v_subtotal,p_coupon_code);v_discount:=coalesce((v_quote->>'discount_amount')::numeric,0);v_source:=coalesce(v_quote->>'source','none');if v_source='coupon' then v_winning_coupon:=nullif(v_quote->>'code','');v_campaign_id:=nullif(v_quote->>'platform_campaign_id','')::uuid;end if;
  if v_campaign_id is not null then
    select * into v_campaign from public.platform_coupon_campaigns where id=v_campaign_id for update;if not found or not v_campaign.is_active or now()<v_campaign.start_at or now()>=v_campaign.end_at then raise exception 'COUPON_INVALID';end if;
    select count(*)::int into v_global_uses from public.coupon_usages cu join public.coupons c on c.id=cu.coupon_id where c.platform_campaign_id=v_campaign_id;if v_campaign.usage_limit is not null and v_global_uses>=v_campaign.usage_limit then raise exception 'COUPON_LIMIT_REACHED';end if;
    select count(*)::int into v_customer_uses from public.coupon_usages cu join public.coupons c on c.id=cu.coupon_id where c.platform_campaign_id=v_campaign_id and cu.customer_id=auth.uid();if v_customer_uses>=v_campaign.per_customer_limit then raise exception 'COUPON_USER_LIMIT';end if;
    if v_campaign.first_order_only then select count(*)::int into v_prior_orders from public.orders o where o.customer_id=auth.uid() and lower(coalesce(o.status,'')) not in ('cancelled','canceled','ملغي','ملغى');if v_prior_orders>0 then raise exception 'COUPON_FIRST_ORDER_ONLY';end if;end if;
  end if;
  v_result:=public.create_customer_order_v4(p_store_id,p_customer_name,p_customer_phone,p_delivery_address,p_payment_method,p_notes,v_winning_coupon,p_items);v_order_id:=(v_result->>'id')::uuid;
  if v_source='promotion' and v_discount>0 then select delivery_fee into v_delivery from public.orders where id=v_order_id;v_new_total:=greatest(v_subtotal+coalesce(v_delivery,0)-v_discount,0);update public.orders set discount_amount=v_discount,total=v_new_total where id=v_order_id;v_result:=jsonb_set(v_result,'{discount_amount}',to_jsonb(v_discount),true);v_result:=jsonb_set(v_result,'{total}',to_jsonb(v_new_total),true);end if;
  v_result:=v_result||jsonb_build_object('discount_source',v_source,'promotion_id',case when v_source='promotion' then v_quote->>'promotion_id' else null end,'platform_campaign_id',case when v_campaign_id is null then null else v_campaign_id::text end,'discount_title',v_quote->>'title');return v_result;
end;
$$;
revoke all on function public.create_customer_order_v5(uuid,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.create_customer_order_v5(uuid,text,text,text,text,text,text,jsonb) to authenticated;

-- Backfill no campaigns automatically; only campaigns created through this stage are central.
notify pgrst,'reload schema';
commit;

select to_regclass('public.platform_coupon_campaigns') is not null as platform_campaigns_ready,
       to_regprocedure('public.admin_create_platform_coupon_campaign(text,text,text,numeric,numeric,numeric,integer,integer,boolean,timestamptz,timestamptz,boolean)') is not null as create_campaign_ready,
       to_regprocedure('public.quote_store_discount_v5(uuid,numeric,text)') is not null as quote_v5_ready;
