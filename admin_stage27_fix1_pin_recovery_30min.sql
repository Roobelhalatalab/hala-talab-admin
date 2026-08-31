-- Hala Talab Admin Stage 27 FIX1 — PIN recovery expiry = 30 minutes
-- Safe to run after admin_stage27_pin_recovery.sql.
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

select 'admin_pin_recovery_30min_ready' as status;
