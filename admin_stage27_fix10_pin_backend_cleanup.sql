-- Hala Talab Admin Stage 27 FIX10 — PIN backend cleanup (backend only)
-- Purpose: replace the single admin PIN-code RPC cleanly and remove the ambiguous request_id error.
-- IMPORTANT: this patch does NOT modify the admin frontend, notifications UI, or Realtime subscriptions.
-- It preserves the FIX9 30-minute account+role code window.

begin;

-- The old function can survive across previous patches. Drop the exact RPC signature first,
-- then create one final definition so there is no older body left behind.
drop function if exists public.admin_issue_phone_pin_reset_code(uuid);

create function public.admin_issue_phone_pin_reset_code(p_request_id uuid)
returns table(request_id uuid, recovery_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_role text;
  v_status text;
  v_code text;
  v_hash text;
  v_exp timestamptz;
begin
  if not public.hala_is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select r.auth_user_id, r.account_role, r.status
    into v_user, v_role, v_status
    from public.phone_pin_reset_requests as r
   where r.id = p_request_id
   for update;

  if not found or v_status not in ('pending', 'issued') then
    raise exception 'RESET_REQUEST_NOT_OPEN';
  end if;

  -- Reuse the same code for this account + role while its original 30-minute window is active.
  select w.recovery_code, w.code_hash, w.expires_at
    into v_code, v_hash, v_exp
    from public.phone_pin_reset_account_window as w
   where w.auth_user_id = v_user
     and w.account_role = v_role
     and w.expires_at > now()
   for update;

  -- No active window: create exactly one new six-digit code and a 30-minute window.
  if not found then
    v_code := lpad((floor(random() * 1000000)::integer)::text, 6, '0');
    v_hash := crypt(v_code, gen_salt('bf', 10));
    v_exp := now() + interval '30 minutes';

    insert into public.phone_pin_reset_account_window
      (auth_user_id, account_role, recovery_code, code_hash, expires_at, created_at, updated_at)
    values
      (v_user, v_role, v_code, v_hash, v_exp, now(), now())
    on conflict (auth_user_id, account_role) do update
      set recovery_code = excluded.recovery_code,
          code_hash = excluded.code_hash,
          expires_at = excluded.expires_at,
          created_at = excluded.created_at,
          updated_at = now();
  end if;

  update public.phone_pin_reset_requests as r
     set status = 'issued',
         code_hash = v_hash,
         code_expires_at = v_exp,
         failed_attempts = 0,
         issued_at = coalesce(r.issued_at, now()),
         handled_by = auth.uid(),
         updated_at = now()
   where r.id = p_request_id;

  -- Avoid ON CONFLICT(request_id) here because request_id is also an OUT column of this function.
  -- Update first, then insert only when missing. This removes the PostgreSQL ambiguity completely.
  update public.phone_pin_reset_code_display as d
     set recovery_code = v_code,
         expires_at = v_exp,
         created_at = now()
   where d.request_id = p_request_id;

  if not found then
    insert into public.phone_pin_reset_code_display
      (request_id, recovery_code, expires_at, created_at)
    values
      (p_request_id, v_code, v_exp, now());
  end if;

  return query
  select p_request_id, v_code, v_exp;
end;
$$;

revoke all on function public.admin_issue_phone_pin_reset_code(uuid) from public, anon;
grant execute on function public.admin_issue_phone_pin_reset_code(uuid) to authenticated;

-- Keep the Realtime table registration intact; do not recreate notification logic.
alter table public.phone_pin_reset_requests replica identity full;
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'phone_pin_reset_requests'
  ) then
    alter publication supabase_realtime add table public.phone_pin_reset_requests;
  end if;
exception
  when duplicate_object then null;
end
$$;

commit;

select 'stage27_fix10_pin_backend_cleanup_ready' as status;
