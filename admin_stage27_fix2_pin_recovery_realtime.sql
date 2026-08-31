-- Hala Talab Admin Stage 27 FIX2 — PIN recovery realtime
-- Run once after admin_stage27_pin_recovery.sql / FIX1.
-- Enables immediate INSERT/UPDATE events in the admin dashboard without browser refresh.

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

select 'admin_pin_recovery_realtime_ready' as status;
