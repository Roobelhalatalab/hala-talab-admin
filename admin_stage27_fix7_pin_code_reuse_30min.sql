-- Hala Talab Admin Stage 27 FIX7 — reuse the same PIN recovery code for 30 minutes
-- Run once after the Stage 27 PIN recovery SQL/FIX1.
-- Goal:
-- 1) Repeated "forgot PIN" requests during the active 30-minute window reuse the same request.
-- 2) Re-opening the admin page shows the exact same recovery code instead of generating a new one.
-- 3) A new code is created only after expiry/completion/rejection/lockout/new request lifecycle.

create table if not exists public.phone_pin_reset_code_display (
  request_id uuid primary key references public.phone_pin_reset_requests(id) on delete cascade,
  recovery_code text not null check (recovery_code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.phone_pin_reset_code_display enable row level security;

drop policy if exists phone_pin_reset_code_display_admin_select on public.phone_pin_reset_code_display;
create policy phone_pin_reset_code_display_admin_select on public.phone_pin_reset_code_display
for select to authenticated using (public.hala_is_admin());

-- A repeated forgot-PIN action while an existing request/code is still valid
-- returns that same request instead of cancelling it and creating another one.
create or replace function public.server_request_phone_pin_reset(p_user_id uuid, p_phone_e164 text, p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_status text;
  v_exp timestamptz;
begin
  if p_role not in ('customer','business','driver') then raise exception 'UNSUPPORTED_ROLE'; end if;

  select id, status, code_expires_at
    into v_id, v_status, v_exp
    from public.phone_pin_reset_requests
   where auth_user_id=p_user_id
     and account_role=p_role
     and status in ('pending','issued')
   order by requested_at desc
   limit 1
   for update;

  if found then
    -- Pending request is already waiting for admin: reuse it.
    if v_status='pending' then
      update public.phone_pin_reset_requests
         set phone_e164=p_phone_e164, updated_at=now()
       where id=v_id;
      return v_id;
    end if;

    -- Issued and still valid: keep the same request/code for the full 30 minutes.
    if v_status='issued' and v_exp is not null and v_exp>now() then
      update public.phone_pin_reset_requests
         set phone_e164=p_phone_e164, updated_at=now()
       where id=v_id;
      return v_id;
    end if;

    -- Old issued code expired: close it before creating a fresh request.
    if v_status='issued' then
      update public.phone_pin_reset_requests
         set status='expired', updated_at=now()
       where id=v_id;
    end if;
  end if;

  insert into public.phone_pin_reset_requests(auth_user_id,phone_e164,account_role,status)
  values(p_user_id,p_phone_e164,p_role,'pending') returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.server_request_phone_pin_reset(uuid,text,text) from public, anon, authenticated;
grant execute on function public.server_request_phone_pin_reset(uuid,text,text) to service_role;

-- If the request already has a valid issued code, return exactly that same code.
-- Otherwise issue one new 6-digit code and remember it for admin display until expiry.
create or replace function public.admin_issue_phone_pin_reset_code(p_request_id uuid)
returns table(request_id uuid, recovery_code text, expires_at timestamptz)
language plpgsql security definer set search_path=public, extensions as $$
declare
  v_code text;
  v_exp timestamptz;
  v_status text;
  v_current_exp timestamptz;
begin
  if not public.hala_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select status, code_expires_at
    into v_status, v_current_exp
    from public.phone_pin_reset_requests
   where id=p_request_id
   for update;

  if not found or v_status not in ('pending','issued') then
    raise exception 'RESET_REQUEST_NOT_OPEN';
  end if;

  if v_status='issued' and v_current_exp is not null and v_current_exp>now() then
    select d.recovery_code, d.expires_at
      into v_code, v_exp
      from public.phone_pin_reset_code_display d
     where d.request_id=p_request_id
       and d.expires_at>now();

    if v_code is not null then
      return query select p_request_id, v_code, v_exp;
      return;
    end if;

    -- Compatibility fallback for codes issued before FIX7: we cannot recover
    -- plaintext from the old hash, so issue one replacement only once and store it.
  end if;

  v_code := lpad((floor(random()*1000000)::integer)::text,6,'0');
  v_exp := now()+interval '30 minutes';

  update public.phone_pin_reset_requests
     set status='issued',
         code_hash=crypt(v_code,gen_salt('bf',10)),
         code_expires_at=v_exp,
         failed_attempts=0,
         issued_at=now(),
         handled_by=auth.uid(),
         updated_at=now()
   where id=p_request_id;

  insert into public.phone_pin_reset_code_display(request_id,recovery_code,expires_at)
  values(p_request_id,v_code,v_exp)
  on conflict on constraint phone_pin_reset_code_display_pkey do update
    set recovery_code=excluded.recovery_code,
        expires_at=excluded.expires_at,
        created_at=now();

  return query select p_request_id,v_code,v_exp;
end; $$;
revoke all on function public.admin_issue_phone_pin_reset_code(uuid) from public, anon;
grant execute on function public.admin_issue_phone_pin_reset_code(uuid) to authenticated;

-- Keep existing redemption behavior, but remove the admin-display copy after success.
create or replace function public.server_redeem_phone_pin_reset_code(p_user_id uuid,p_role text,p_code text,p_new_pin text)
returns text language plpgsql security definer set search_path=public, extensions as $$
declare
  v public.phone_pin_reset_requests%rowtype;
  v_attempts integer;
  v_phone text;
begin
  if p_new_pin !~ '^[0-9]{4}$' then return 'INVALID_PIN'; end if;
  if p_code !~ '^[0-9]{6}$' then return 'INVALID_RECOVERY_CODE'; end if;
  select * into v from public.phone_pin_reset_requests
   where auth_user_id=p_user_id and account_role=p_role and status='issued'
   order by issued_at desc nulls last limit 1 for update;
  if not found then return 'RESET_CODE_NOT_ISSUED'; end if;
  if v.code_expires_at is null or v.code_expires_at<=now() then
    update public.phone_pin_reset_requests set status='expired',updated_at=now() where id=v.id;
    delete from public.phone_pin_reset_code_display where request_id=v.id;
    return 'RESET_CODE_EXPIRED';
  end if;
  if v.failed_attempts>=5 then return 'RESET_CODE_LOCKED'; end if;
  if v.code_hash is null or v.code_hash<>crypt(p_code,v.code_hash) then
    v_attempts:=v.failed_attempts+1;
    update public.phone_pin_reset_requests set failed_attempts=v_attempts,updated_at=now() where id=v.id;
    if v_attempts>=5 then delete from public.phone_pin_reset_code_display where request_id=v.id; end if;
    return case when v_attempts>=5 then 'RESET_CODE_LOCKED' else 'RESET_CODE_INCORRECT' end;
  end if;
  select phone_e164 into v_phone from public.phone_account_registry where auth_user_id=p_user_id;
  perform public.server_set_phone_pin(p_user_id,v_phone,p_new_pin);
  update public.phone_pin_reset_requests set status='completed',completed_at=now(),code_hash=null,updated_at=now() where id=v.id;
  delete from public.phone_pin_reset_code_display where request_id=v.id;
  return 'OK';
end; $$;
revoke all on function public.server_redeem_phone_pin_reset_code(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.server_redeem_phone_pin_reset_code(uuid,text,text,text) to service_role;

select 'admin_pin_recovery_same_code_30min_ready' as status;
