-- Hala Talab Admin - Stage 14
-- Driver approval ON/OFF switch. Safe to run after Partners Stage 134.

create table if not exists public.admin_system_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.admin_system_settings(setting_key, setting_value)
values ('driver_approval_required', 'false')
on conflict (setting_key) do nothing;

-- The admin page already uses its authenticated admin RLS/RPC layer to edit settings.
-- Keep this setting present so the UI can switch between direct signup and approval mode.
notify pgrst, 'reload schema';

select setting_key, setting_value
from public.admin_system_settings
where setting_key='driver_approval_required';
