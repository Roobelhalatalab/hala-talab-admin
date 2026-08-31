-- Hala Talab Admin — Stage 36 FINAL
-- Central, schema-tolerant admin push pipeline.
-- One event bus table -> one dispatcher -> one Edge Function -> OneSignal -> iOS/iPadOS/Android Web Push.
-- Safe to re-run. Existing business tables are not altered.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- 1) Central outbox/event bus.
create table if not exists public.admin_push_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_key text not null,
  source_table text not null,
  source_id text not null,
  account_role text,
  title text not null,
  message text not null,
  admin_target text not null,
  target_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_push_events_event_key_uidx
  on public.admin_push_events(event_key);
create index if not exists admin_push_events_created_at_idx
  on public.admin_push_events(created_at desc);

alter table public.admin_push_events enable row level security;
revoke all on table public.admin_push_events from anon, authenticated;

-- 2) Private shared secret used only DB -> Edge Function.
-- Generated inside Vault. Never stored in GitHub or browser files.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'admin_push_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'admin_push_webhook_secret');
  end if;
end $$;

-- 3) Helpers that tolerate real-world column name differences by reading NEW as jsonb.
create or replace function public.hala_first_text(p_row jsonb, variadic p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  foreach k in array p_keys loop
    v := nullif(btrim(coalesce(p_row ->> k, '')), '');
    if v is not null then return v; end if;
  end loop;
  return null;
end;
$$;

create or replace function public.enqueue_admin_push_event(
  p_event_type text,
  p_event_key text,
  p_source_table text,
  p_source_id text,
  p_account_role text,
  p_title text,
  p_message text,
  p_admin_target text,
  p_target_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_push_events(
    event_type,event_key,source_table,source_id,account_role,
    title,message,admin_target,target_id
  ) values (
    p_event_type,p_event_key,p_source_table,p_source_id,p_account_role,
    p_title,p_message,p_admin_target,p_target_id
  )
  on conflict (event_key) do nothing;
end;
$$;

revoke all on function public.enqueue_admin_push_event(text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;

-- 4) PIN recovery trigger. No hard dependency on individual column names.
create or replace function public.trg_admin_push_pin_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  oldj jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_id text;
  v_role text;
  v_status text;
  v_phone text;
  v_stamp text;
  v_old_stamp text;
  v_who text;
  v_target text;
begin
  v_id := coalesce(public.hala_first_text(j,'id','request_id','uuid'), gen_random_uuid()::text);
  v_role := lower(coalesce(public.hala_first_text(j,'account_role','role','user_role','user_type','partner_type'), 'customer'));
  v_status := lower(coalesce(public.hala_first_text(j,'status','state','request_status'), 'pending'));
  v_phone := public.hala_first_text(j,'phone_e164','phone','phone_number','mobile');
  v_stamp := coalesce(public.hala_first_text(j,'requested_at','request_at','updated_at','created_at'), clock_timestamp()::text);
  v_old_stamp := public.hala_first_text(oldj,'requested_at','request_at','updated_at','created_at');

  if v_role in ('store','merchant','business_owner','partner') then v_role := 'business'; end if;
  if v_role in ('user','client') then v_role := 'customer'; end if;
  if v_role not in ('customer','business','driver') then return new; end if;

  if v_status not in ('pending','issued','requested','new','open') then return new; end if;
  if tg_op = 'UPDATE' and v_stamp is not distinct from v_old_stamp then return new; end if;

  v_who := case v_role when 'driver' then 'السائق' when 'business' then 'المتجر' else 'العميل' end;
  v_target := case when v_role='customer' then 'pin-customers' else 'pin-partners' end;

  perform public.enqueue_admin_push_event(
    'pin_reset',
    format('pin_reset:%s:%s', v_id, md5(v_stamp)),
    tg_table_name,
    v_id,
    v_role,
    '🔐 طلب استرجاع PIN',
    'طلب استرجاع PIN من ' || v_who || case when v_phone is not null then ' · ' || v_phone else '' end,
    v_target,
    v_id
  );
  return new;
end;
$$;

-- 5) New store registration trigger, schema-tolerant.
create or replace function public.trg_admin_push_new_store()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  v_id text;
  v_name text;
begin
  v_id := coalesce(public.hala_first_text(j,'id','store_id','partner_id','uuid'), gen_random_uuid()::text);
  v_name := coalesce(public.hala_first_text(j,'name','store_name','business_name','display_name','title'), 'متجر جديد');

  perform public.enqueue_admin_push_event(
    'store_signup',
    format('store_signup:%s:%s', tg_table_name, v_id),
    tg_table_name,
    v_id,
    'business',
    '🏪 تسجيل متجر جديد',
    'طلب انضمام متجر جديد: ' || v_name,
    'stores',
    v_id
  );
  return new;
end;
$$;

-- 6) New driver registration trigger, schema-tolerant.
create or replace function public.trg_admin_push_new_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  v_id text;
  v_role text;
  v_name text;
begin
  v_id := coalesce(public.hala_first_text(j,'id','driver_id','partner_id','uuid'), gen_random_uuid()::text);
  v_role := lower(coalesce(public.hala_first_text(j,'partner_type','account_role','role','user_role','type'), case when tg_table_name='drivers' then 'driver' else '' end));
  if v_role not in ('driver','courier','delivery_driver') then return new; end if;

  v_name := coalesce(public.hala_first_text(j,'full_name','name','display_name','email','phone_e164','phone'), 'سائق جديد');

  perform public.enqueue_admin_push_event(
    'driver_signup',
    format('driver_signup:%s:%s', tg_table_name, v_id),
    tg_table_name,
    v_id,
    'driver',
    '🚚 تسجيل سائق جديد',
    'طلب انضمام سائق جديد: ' || v_name,
    'drivers',
    v_id
  );
  return new;
end;
$$;

-- 7) Install source triggers idempotently. Missing tables are skipped cleanly.
do $$
declare
  t text;
begin
  -- PIN recovery candidate tables.
  foreach t in array array['phone_pin_reset_requests','pin_reset_requests','pin_recovery_requests'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists hala_admin_push_pin_reset on public.%I', t);
      execute format('create trigger hala_admin_push_pin_reset after insert or update on public.%I for each row execute function public.trg_admin_push_pin_reset()', t);
    end if;
  end loop;

  -- Store candidate tables. Prefer stores; partner_profiles is handled by role-aware driver trigger separately.
  foreach t in array array['stores','businesses','merchants'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists hala_admin_push_new_store on public.%I', t);
      execute format('create trigger hala_admin_push_new_store after insert on public.%I for each row execute function public.trg_admin_push_new_store()', t);
    end if;
  end loop;

  -- Driver candidate tables.
  foreach t in array array['partner_profiles','drivers','driver_profiles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists hala_admin_push_new_driver on public.%I', t);
      execute format('create trigger hala_admin_push_new_driver after insert on public.%I for each row execute function public.trg_admin_push_new_driver()', t);
    end if;
  end loop;
end $$;

-- 8) One central dispatcher: every admin event calls ONE Edge Function.
create or replace function public.trg_dispatch_admin_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
  v_url text := 'https://czoqxshblhgwanwsrudk.supabase.co/functions/v1/admin-onesignal-push';
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'admin_push_webhook_secret'
  order by created_at desc
  limit 1;

  if v_secret is null then
    raise warning 'admin_push_webhook_secret is missing; event % was queued but not dispatched', new.id;
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-hala-admin-push-secret',v_secret
    ),
    body := jsonb_build_object(
      'id',new.id,
      'event_type',new.event_type,
      'event_key',new.event_key,
      'source_table',new.source_table,
      'source_id',new.source_id,
      'account_role',new.account_role,
      'title',new.title,
      'message',new.message,
      'admin_target',new.admin_target,
      'target_id',new.target_id
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists hala_admin_push_dispatch on public.admin_push_events;
create trigger hala_admin_push_dispatch
after insert on public.admin_push_events
for each row execute function public.trg_dispatch_admin_push_event();

commit;

-- IMPORTANT: copy ONLY the secret_value shown below into Edge Function Secret:
-- Name: ADMIN_PUSH_WEBHOOK_SECRET
-- Do NOT share this result or upload it to GitHub.
select
  'stage36_final_central_push_ready' as status,
  (select decrypted_secret from vault.decrypted_secrets where name='admin_push_webhook_secret' order by created_at desc limit 1) as secret_value;
