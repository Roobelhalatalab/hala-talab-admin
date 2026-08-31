-- Hala Talab Admin Stage 27 FIX9
-- Stable 30-minute PIN recovery window per account + fresh realtime alert for every new Forgot-PIN request.
-- Run ONCE after FIX8. Idempotent / safe to run again.
--
-- Contract:
-- 1) The 6-digit recovery code belongs to (auth_user_id + account_role) for 30 minutes from first issuance.
-- 2) Completing a PIN change does NOT rotate/delete that 30-minute code window.
-- 3) A new Forgot-PIN request during that window creates a fresh request/Realtime event but reuses the SAME code.
-- 4) Only after the 30-minute window expires can a newly-issued code be different.

create table if not exists public.phone_pin_reset_account_window (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  account_role text not null check (account_role in ('customer','business','driver')),
  recovery_code text not null check (recovery_code ~ '^[0-9]{6}$'),
  code_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, account_role)
);

alter table public.phone_pin_reset_account_window enable row level security;
drop policy if exists phone_pin_reset_account_window_admin_select on public.phone_pin_reset_account_window;
create policy phone_pin_reset_account_window_admin_select
on public.phone_pin_reset_account_window
for select to authenticated
using (public.hala_is_admin());

-- Keep the per-request display table from FIX7.
create table if not exists public.phone_pin_reset_code_display (
  request_id uuid primary key references public.phone_pin_reset_requests(id) on delete cascade,
  recovery_code text not null check (recovery_code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.phone_pin_reset_code_display enable row level security;
drop policy if exists phone_pin_reset_code_display_admin_select on public.phone_pin_reset_code_display;
create policy phone_pin_reset_code_display_admin_select
on public.phone_pin_reset_code_display
for select to authenticated
using (public.hala_is_admin());

-- Best-effort migration of any currently valid FIX7/FIX8 plaintext code into the account window.
insert into public.phone_pin_reset_account_window(auth_user_id,account_role,recovery_code,code_hash,expires_at,created_at,updated_at)
select distinct on (r.auth_user_id,r.account_role)
       r.auth_user_id,
       r.account_role,
       d.recovery_code,
       coalesce(r.code_hash, crypt(d.recovery_code,gen_salt('bf',10))),
       least(d.expires_at,r.code_expires_at),
       now(),
       now()
  from public.phone_pin_reset_requests r
  join public.phone_pin_reset_code_display d on d.request_id=r.id
 where d.expires_at>now()
   and r.code_expires_at>now()
 order by r.auth_user_id,r.account_role,r.issued_at desc nulls last,r.updated_at desc
on conflict (auth_user_id,account_role) do update
set recovery_code=excluded.recovery_code,
    code_hash=excluded.code_hash,
    expires_at=excluded.expires_at,
    updated_at=now()
where public.phone_pin_reset_account_window.expires_at<=now();

-- Every explicit Forgot-PIN action gets a fresh request id (so the admin gets a fresh Realtime alert).
-- If there is an active 30-minute account window, the fresh request is immediately linked to the SAME code.
create or replace function public.server_request_phone_pin_reset(p_user_id uuid, p_phone_e164 text, p_role text)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_code text;
  v_hash text;
  v_exp timestamptz;
begin
  if p_role not in ('customer','business','driver') then
    raise exception 'UNSUPPORTED_ROLE';
  end if;

  -- Close only previous OPEN requests. Historical completed/rejected rows are retained.
  update public.phone_pin_reset_requests r
     set status='cancelled', updated_at=now()
   where r.auth_user_id=p_user_id
     and r.account_role=p_role
     and r.status in ('pending','issued');

  select w.recovery_code,w.code_hash,w.expires_at
    into v_code,v_hash,v_exp
    from public.phone_pin_reset_account_window w
   where w.auth_user_id=p_user_id
     and w.account_role=p_role
     and w.expires_at>now()
   for update;

  if found then
    insert into public.phone_pin_reset_requests(
      auth_user_id,phone_e164,account_role,status,code_hash,code_expires_at,
      failed_attempts,requested_at,issued_at,updated_at
    ) values (
      p_user_id,p_phone_e164,p_role,'issued',v_hash,v_exp,
      0,now(),now(),now()
    ) returning id into v_id;

    insert into public.phone_pin_reset_code_display(request_id,recovery_code,expires_at)
    values(v_id,v_code,v_exp)
    on conflict (request_id) do update
      set recovery_code=excluded.recovery_code,
          expires_at=excluded.expires_at,
          created_at=now();
  else
    -- Remove expired cache only; a NEW code is not created until the admin explicitly issues it.
    delete from public.phone_pin_reset_account_window w
     where w.auth_user_id=p_user_id
       and w.account_role=p_role
       and w.expires_at<=now();

    insert into public.phone_pin_reset_requests(auth_user_id,phone_e164,account_role,status,requested_at,updated_at)
    values(p_user_id,p_phone_e164,p_role,'pending',now(),now())
    returning id into v_id;
  end if;

  return v_id;
end; $$;
revoke all on function public.server_request_phone_pin_reset(uuid,text,text) from public, anon, authenticated;
grant execute on function public.server_request_phone_pin_reset(uuid,text,text) to service_role;

-- Admin issue: reuse the account's active code if one exists; otherwise create ONE new 30-minute code window.
create or replace function public.admin_issue_phone_pin_reset_code(p_request_id uuid)
returns table(request_id uuid, recovery_code text, expires_at timestamptz)
language plpgsql security definer set search_path=public, extensions as $$
declare
  v_user uuid;
  v_role text;
  v_status text;
  v_code text;
  v_hash text;
  v_exp timestamptz;
begin
  if not public.hala_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select r.auth_user_id,r.account_role,r.status
    into v_user,v_role,v_status
    from public.phone_pin_reset_requests r
   where r.id=p_request_id
   for update;

  if not found or v_status not in ('pending','issued') then
    raise exception 'RESET_REQUEST_NOT_OPEN';
  end if;

  select w.recovery_code,w.code_hash,w.expires_at
    into v_code,v_hash,v_exp
    from public.phone_pin_reset_account_window w
   where w.auth_user_id=v_user
     and w.account_role=v_role
     and w.expires_at>now()
   for update;

  if not found then
    v_code := lpad((floor(random()*1000000)::integer)::text,6,'0');
    v_hash := crypt(v_code,gen_salt('bf',10));
    v_exp := now()+interval '30 minutes';

    insert into public.phone_pin_reset_account_window(
      auth_user_id,account_role,recovery_code,code_hash,expires_at,created_at,updated_at
    ) values (v_user,v_role,v_code,v_hash,v_exp,now(),now())
    on conflict (auth_user_id,account_role) do update
      set recovery_code=excluded.recovery_code,
          code_hash=excluded.code_hash,
          expires_at=excluded.expires_at,
          created_at=excluded.created_at,
          updated_at=now();
  end if;

  update public.phone_pin_reset_requests r
     set status='issued',
         code_hash=v_hash,
         code_expires_at=v_exp,
         failed_attempts=0,
         issued_at=coalesce(r.issued_at,now()),
         handled_by=auth.uid(),
         updated_at=now()
   where r.id=p_request_id;

  insert into public.phone_pin_reset_code_display(request_id,recovery_code,expires_at)
  values(p_request_id,v_code,v_exp)
  on conflict (request_id) do update
    set recovery_code=excluded.recovery_code,
        expires_at=excluded.expires_at,
        created_at=now();

  return query select p_request_id,v_code,v_exp;
end; $$;
revoke all on function public.admin_issue_phone_pin_reset_code(uuid) from public, anon;
grant execute on function public.admin_issue_phone_pin_reset_code(uuid) to authenticated;

-- Redeem the newest issued request. Completing it changes the PIN but intentionally leaves
-- the account-window code alive until expires_at, per the agreed 30-minute behavior.
create or replace function public.server_redeem_phone_pin_reset_code(p_user_id uuid,p_role text,p_code text,p_new_pin text)
returns text
language plpgsql security definer set search_path=public, extensions as $$
declare
  v public.phone_pin_reset_requests%rowtype;
  v_attempts integer;
  v_phone text;
  v_window_hash text;
  v_window_exp timestamptz;
begin
  if p_new_pin !~ '^[0-9]{4}$' then return 'INVALID_PIN'; end if;
  if p_code !~ '^[0-9]{6}$' then return 'INVALID_RECOVERY_CODE'; end if;
  if p_role not in ('customer','business','driver') then return 'UNSUPPORTED_ROLE'; end if;

  select * into v
    from public.phone_pin_reset_requests r
   where r.auth_user_id=p_user_id
     and r.account_role=p_role
     and r.status='issued'
   order by r.requested_at desc,r.issued_at desc nulls last
   limit 1
   for update;

  if not found then return 'RESET_CODE_NOT_ISSUED'; end if;

  -- The account window is authoritative for the 30-minute lifetime.
  select w.code_hash,w.expires_at
    into v_window_hash,v_window_exp
    from public.phone_pin_reset_account_window w
   where w.auth_user_id=p_user_id
     and w.account_role=p_role
     and w.expires_at>now();

  if not found or v_window_exp is null or v_window_exp<=now() then
    update public.phone_pin_reset_requests r
       set status='expired',updated_at=now()
     where r.id=v.id;
    return 'RESET_CODE_EXPIRED';
  end if;

  if v.failed_attempts>=5 then return 'RESET_CODE_LOCKED'; end if;

  if v_window_hash is null or v_window_hash<>crypt(p_code,v_window_hash) then
    v_attempts:=v.failed_attempts+1;
    update public.phone_pin_reset_requests r
       set failed_attempts=v_attempts,updated_at=now()
     where r.id=v.id;
    return case when v_attempts>=5 then 'RESET_CODE_LOCKED' else 'RESET_CODE_INCORRECT' end;
  end if;

  select a.phone_e164 into v_phone
    from public.phone_account_registry a
   where a.auth_user_id=p_user_id
   limit 1;

  perform public.server_set_phone_pin(p_user_id,v_phone,p_new_pin);

  update public.phone_pin_reset_requests r
     set status='completed',completed_at=now(),updated_at=now()
   where r.id=v.id;

  -- IMPORTANT: do NOT delete/rotate phone_pin_reset_account_window here.
  -- The SAME recovery code remains the account's code until the original expires_at.
  return 'OK';
end; $$;
revoke all on function public.server_redeem_phone_pin_reset_code(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.server_redeem_phone_pin_reset_code(uuid,text,text,text) to service_role;

-- Realtime hardening in the same patch so the user does not need another SQL file.
alter table public.phone_pin_reset_requests replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname='supabase_realtime'
       and schemaname='public'
       and tablename='phone_pin_reset_requests'
  ) then
    alter publication supabase_realtime add table public.phone_pin_reset_requests;
  end if;
exception when duplicate_object then null;
end $$;

select 'stage27_fix9_pin_account_window_30min_and_realtime_ready' as status;
