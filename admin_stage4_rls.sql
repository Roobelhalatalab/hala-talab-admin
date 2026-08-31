-- Hala Talab Admin Stage 4
-- Store management read access + isolated admin review workflow.

create table if not exists public.admin_store_reviews (
  store_id uuid primary key references public.stores(id) on delete cascade,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected','suspended')),
  notes text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.admin_store_reviews enable row level security;

-- Helper expression is repeated deliberately to avoid SECURITY DEFINER functions.
drop policy if exists "admin read stores stage4" on public.stores;
create policy "admin read stores stage4"
on public.stores for select to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.id = auth.uid() and au.role = 'admin' and au.is_active = true
));

drop policy if exists "admin read partner profiles stage4" on public.partner_profiles;
create policy "admin read partner profiles stage4"
on public.partner_profiles for select to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.id = auth.uid() and au.role = 'admin' and au.is_active = true
));

drop policy if exists "admin read store reviews" on public.admin_store_reviews;
create policy "admin read store reviews"
on public.admin_store_reviews for select to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.id = auth.uid() and au.role = 'admin' and au.is_active = true
));

drop policy if exists "admin insert store reviews" on public.admin_store_reviews;
create policy "admin insert store reviews"
on public.admin_store_reviews for insert to authenticated
with check (
  reviewed_by = auth.uid() and exists (
    select 1 from public.admin_users au
    where au.id = auth.uid() and au.role = 'admin' and au.is_active = true
  )
);

drop policy if exists "admin update store reviews" on public.admin_store_reviews;
create policy "admin update store reviews"
on public.admin_store_reviews for update to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.id = auth.uid() and au.role = 'admin' and au.is_active = true
))
with check (
  reviewed_by = auth.uid() and exists (
    select 1 from public.admin_users au
    where au.id = auth.uid() and au.role = 'admin' and au.is_active = true
  )
);
