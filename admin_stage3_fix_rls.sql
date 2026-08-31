-- Hala Talab Admin Stage 3 Fix
-- Read-only lookup access for admin order details.
-- Run once in Supabase SQL Editor.

alter table public.stores enable row level security;
alter table public.partner_profiles enable row level security;

drop policy if exists "admin read stores for order details" on public.stores;
create policy "admin read stores for order details"
on public.stores
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.id = auth.uid()
      and au.role = 'admin'
      and coalesce(au.is_active, true) = true
  )
);

drop policy if exists "admin read partner profiles for order details" on public.partner_profiles;
create policy "admin read partner profiles for order details"
on public.partner_profiles
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.id = auth.uid()
      and au.role = 'admin'
      and coalesce(au.is_active, true) = true
  )
);
