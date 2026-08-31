-- Hala Talab Admin Stage 27 FIX8 — fix ambiguous request_id when issuing PIN recovery code
-- Run once after FIX7. This replaces only the admin code-issuance function.

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

  select r.status, r.code_expires_at
    into v_status, v_current_exp
    from public.phone_pin_reset_requests as r
   where r.id=p_request_id
   for update;

  if not found or v_status not in ('pending','issued') then
    raise exception 'RESET_REQUEST_NOT_OPEN';
  end if;

  if v_status='issued' and v_current_exp is not null and v_current_exp>now() then
    select d.recovery_code, d.expires_at
      into v_code, v_exp
      from public.phone_pin_reset_code_display as d
     where d.request_id=p_request_id
       and d.expires_at>now();

    if v_code is not null then
      return query select p_request_id, v_code, v_exp;
      return;
    end if;
  end if;

  v_code := lpad((floor(random()*1000000)::integer)::text,6,'0');
  v_exp := now()+interval '30 minutes';

  update public.phone_pin_reset_requests as r
     set status='issued',
         code_hash=crypt(v_code,gen_salt('bf',10)),
         code_expires_at=v_exp,
         failed_attempts=0,
         issued_at=now(),
         handled_by=auth.uid(),
         updated_at=now()
   where r.id=p_request_id;

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

select 'admin_pin_issue_ambiguous_request_id_fixed' as status;
