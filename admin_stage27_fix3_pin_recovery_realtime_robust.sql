-- Hala Talab Admin Stage 27 FIX3 — robust PIN recovery realtime
-- Run once after admin_stage27_pin_recovery.sql / FIX1.
-- Safe to run more than once.

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
end $$;

select
  case when exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='phone_pin_reset_requests'
  ) then 'admin_pin_recovery_realtime_ready'
  else 'admin_pin_recovery_realtime_not_ready'
  end as status;
