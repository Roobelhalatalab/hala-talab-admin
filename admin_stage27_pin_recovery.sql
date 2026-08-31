-- Hala Talab Admin Stage 27 — PIN recovery workflow
-- Run after the Phone + PIN authentication SQL.

-- Stage PIN recovery: admin-reviewed reset requests (no SMS/WhatsApp dependency).
create table if not exists public.phone_pin_reset_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  account_role text not null check (account_role in ('customer','business','driver')),
  status text not null default 'pending' check (status in ('pending','issued','completed','rejected','expired','cancelled')),
  code_hash text,
  code_expires_at timestamptz,
  failed_attempts integer not null default 0,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  completed_at timestamptz,
  handled_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_phone_pin_reset_requests_status on public.phone_pin_reset_requests(status, requested_at desc);
create index if not exists idx_phone_pin_reset_requests_user on public.phone_pin_reset_requests(auth_user_id, requested_at desc);
alter table public.phone_pin_reset_requests enable row level security;

create or replace function public.hala_is_admin()
returns boolean language plpgsql security definer set search_path=public as $$
declare v_role text;
begin
  if auth.uid() is null then return false; end if;
  if exists(select 1 from public.admin_users a where a.id=auth.uid() and lower(coalesce(a.role,'admin'))='admin' and coalesce(a.is_active,true)) then return true; end if;
  select lower(role) into v_role from public.account_roles where user_id=auth.uid() limit 1;
  if v_role='admin' then return true; end if;
  select lower(coalesce(raw_user_meta_data->>'account_role',raw_user_meta_data->>'role','')) into v_role from auth.users where id=auth.uid();
  return v_role='admin';
end; $$;
grant execute on function public.hala_is_admin() to authenticated;

-- Admin dashboard can read requests only if the signed-in user is an admin.
drop policy if exists phone_pin_reset_admin_select on public.phone_pin_reset_requests;
create policy phone_pin_reset_admin_select on public.phone_pin_reset_requests
for select to authenticated using (public.hala_is_admin());

create or replace function public.server_request_phone_pin_reset(p_user_id uuid, p_phone_e164 text, p_role text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_role not in ('customer','business','driver') then raise exception 'UNSUPPORTED_ROLE'; end if;
  update public.phone_pin_reset_requests
     set status='cancelled', updated_at=now()
   where auth_user_id=p_user_id and status in ('pending','issued');
  insert into public.phone_pin_reset_requests(auth_user_id,phone_e164,account_role,status)
  values(p_user_id,p_phone_e164,p_role,'pending') returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.server_request_phone_pin_reset(uuid,text,text) from public, anon, authenticated;
grant execute on function public.server_request_phone_pin_reset(uuid,text,text) to service_role;

create or replace function public.admin_issue_phone_pin_reset_code(p_request_id uuid)
returns table(request_id uuid, recovery_code text, expires_at timestamptz)
language plpgsql security definer set search_path=public, extensions as $$
declare
  v_code text;
  v_exp timestamptz := now()+interval '30 minutes';
  v_exists boolean;
begin
  if not public.hala_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select true into v_exists from public.phone_pin_reset_requests where id=p_request_id and status in ('pending','issued') for update;
  if not coalesce(v_exists,false) then raise exception 'RESET_REQUEST_NOT_OPEN'; end if;
  v_code := lpad((floor(random()*1000000)::integer)::text,6,'0');
  update public.phone_pin_reset_requests
     set status='issued', code_hash=crypt(v_code,gen_salt('bf',10)), code_expires_at=v_exp,
         failed_attempts=0, issued_at=now(), handled_by=auth.uid(), updated_at=now()
   where id=p_request_id;
  return query select p_request_id,v_code,v_exp;
end; $$;
revoke all on function public.admin_issue_phone_pin_reset_code(uuid) from public, anon;
grant execute on function public.admin_issue_phone_pin_reset_code(uuid) to authenticated;

create or replace function public.admin_reject_phone_pin_reset(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.hala_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.phone_pin_reset_requests set status='rejected', handled_by=auth.uid(), updated_at=now()
   where id=p_request_id and status in ('pending','issued');
end; $$;
revoke all on function public.admin_reject_phone_pin_reset(uuid) from public, anon;
grant execute on function public.admin_reject_phone_pin_reset(uuid) to authenticated;

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
    return 'RESET_CODE_EXPIRED';
  end if;
  if v.failed_attempts>=5 then return 'RESET_CODE_LOCKED'; end if;
  if v.code_hash is null or v.code_hash<>crypt(p_code,v.code_hash) then
    v_attempts:=v.failed_attempts+1;
    update public.phone_pin_reset_requests set failed_attempts=v_attempts,updated_at=now() where id=v.id;
    return case when v_attempts>=5 then 'RESET_CODE_LOCKED' else 'RESET_CODE_INCORRECT' end;
  end if;
  select phone_e164 into v_phone from public.phone_account_registry where auth_user_id=p_user_id;
  perform public.server_set_phone_pin(p_user_id,v_phone,p_new_pin);
  update public.phone_pin_reset_requests set status='completed',completed_at=now(),code_hash=null,updated_at=now() where id=v.id;
  return 'OK';
end; $$;
revoke all on function public.server_redeem_phone_pin_reset_code(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.server_redeem_phone_pin_reset_code(uuid,text,text,text) to service_role;


select 'admin_pin_recovery_ready' as status;
