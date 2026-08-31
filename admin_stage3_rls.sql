-- Hala Talab Admin Stage 3
-- Allow authenticated users who are listed in public.admin_users with role=admin
-- to read and update orders. Run once in Supabase SQL Editor.

alter table public.orders enable row level security;

drop policy if exists "admin read all orders" on public.orders;
create policy "admin read all orders"
on public.orders
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

drop policy if exists "admin update all orders" on public.orders;
create policy "admin update all orders"
on public.orders
for update
to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.id = auth.uid()
      and au.role = 'admin'
      and coalesce(au.is_active, true) = true
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.id = auth.uid()
      and au.role = 'admin'
      and coalesce(au.is_active, true) = true
  )
);
